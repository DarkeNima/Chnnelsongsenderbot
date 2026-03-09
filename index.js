/*
    WhatsApp Bot Base
    Modified by: Naviya
*/

const {
    default: makeWASocket,
    DisconnectReason,
    makeInMemoryStore,
    jidDecode,
    proto,
    getContentType,
    useMultiFileAuthState,
    downloadContentFromMessage
} = require('bail');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const readline = require('readline');
const PhoneNumber = require('awesome-phonenumber');
const chalk = require('chalk');
const { File } = require('megajs');

// Config file එක load කිරීම
require('./config');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const store = makeInMemoryStore({
    'logger': pino().child({ 'level': 'silent', 'stream': 'store' })
});

const question = text => {
    const rl = readline.createInterface({
        'input': process.stdin,
        'output': process.stdout
    });
    return new Promise(resolve => {
        rl.question(text, resolve);
    });
};

const SESSION_DIR = './session';
const SESSION_FILE = SESSION_DIR + '/creds.json';

async function StartNaviyaBot() {
    // Session folder එක නැත්නම් සෑදීම
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { 'recursive': true });
        console.log(chalk.cyan('→ Created session directory'));
    }

    // Mega.nz හරහා session එක download කිරීම (config.js හි session_id තිබේ නම්)
    if (!fs.existsSync(SESSION_FILE)) {
        if (global.session_id && global.session_id.includes('=')) {
            console.log(chalk.yellow('→ Local session not found. Downloading from Mega...'));
            try {
                // මෙතන 'DanuXxxii=' වෙනුවට ඕනෑම prefix එකක් තිබුණත් එය ඉවත් කර ID එක පමණක් ගනී
                const megaId = global.session_id.split('=')[1].trim();
                const file = File.fromURL('https://mega.nz/file/' + megaId);
                await new Promise((resolve, reject) => {
                    file.download((err, data) => {
                        if (err) return reject(err);
                        fs.writeFileSync(SESSION_FILE, data);
                        console.log(chalk.green('→ Naviya Bot Session downloaded successfully ✓'));
                        resolve();
                    });
                });
            } catch (err) {
                console.error(chalk.red('Mega download failed:'), err.message);
                console.log(chalk.yellow('→ Falling back to pairing code...'));
            }
        } else {
            console.log(chalk.dim('→ No session_id provided. Using pairing code...'));
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const isNewSession = !state.creds.registered;
    
    const sock = makeWASocket({
        'logger': pino({ 'level': 'silent' }),
        'printQRInTerminal': false,
        'auth': state,
        'connectTimeoutMs': 60000,
        'defaultQueryTimeoutMs': 0,
        'keepAliveIntervalMs': 10000,
        'emitOwnEvents': true,
        'fireInitQueries': true,
        'generateHighQualityLinkPreview': true,
        'syncFullHistory': true,
        'markOnlineOnConnect': true,
        'browser': ['Naviya-Bot', 'Chrome', '1.0.0']
    });

    // Pairing Code එක ලබා ගැනීම
    if (isNewSession) {
        console.log(chalk.yellow('Starting pairing process...'));
        const phoneNumber = await question(chalk.cyan('\nEnter your Bot Number (e.g. 947xxxxxxxx):\n'));
        let pairingCode = await sock.requestPairingCode(phoneNumber.trim());
        pairingCode = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
        console.log(chalk.green('\nYour Pairing Code:'), chalk.bold.white(pairingCode));
        console.log(chalk.gray('→ Link this code in WhatsApp > Linked Devices > Link with phone number\n'));
    }

    store.bind(sock.ev);

    // Messages Handle කිරීම (wa.js එකට සම්බන්ධ කිරීම)
    sock.ev.on('messages.upsert', async chatUpdate => {
        try {
            let mek = chatUpdate.messages[0];
            if (!mek.message) return;
            mek.message = Object.keys(mek.message)[0] === 'ephemeralMessage' ? mek.message.ephemeralMessage.message : mek.message;
            
            // Status messages ignore කිරීම
            if (mek.key && mek.key.remoteJid === 'status@broadcast') return;
            
            // Public/Private mode check
            if (!sock.public && !mek.key.fromMe && chatUpdate.type === 'notify') return;
            
            let m = smsg(sock, mek, store);
            require('./wa')(sock, m, chatUpdate, store);
        } catch (err) {
            console.log(err);
        }
    });

    sock.decodeJid = jid => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server && decode.user + '@' + decode.server || jid;
        } else return jid;
    };

    sock.getName = (jid, withoutContact = false) => {
        let id = sock.decodeJid(jid);
        let v;
        if (id.endsWith('@g.us')) {
            return new Promise(async resolve => {
                v = store.contacts[id] || {};
                if (!(v.name || v.subject)) v = sock.groupMetadata(id) || {};
                resolve(v.name || v.subject || id.split('@')[0]);
            });
        } else {
            v = id === '0@s.whatsapp.net' ? { 'id': id, 'name': 'WhatsApp' } : id === sock.decodeJid(sock.user.id) ? sock.user : store.contacts[id] || {};
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || id.split('@')[0];
        }
    };

    sock.public = true;
    sock.serializeM = m => smsg(sock, m, store);

    // Connection Updates
    sock.ev.on('connection.update', update => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const errorObj = new Boom(lastDisconnect?.error);
            const statusCode = errorObj?.output?.statusCode ?? null;
            const reason = DisconnectReason[statusCode] || 'UNKNOWN';
            
            console.log(chalk.red.bold('❌ Connection lost:'), chalk.yellow(reason));
            
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow('↻ Reconnecting...'));
                setTimeout(() => StartNaviyaBot(), 3000);
            } else {
                console.log(chalk.red('🚫 Logged out. Delete the session folder and restart.'));
            }
        } else if (connection === 'open') {
            const botNumber = sock.user.id.split(':')[0];
            
            console.log(chalk.green.bold('\n╔════════════════════════════════════════════╗'));
            console.log(chalk.green.bold('║          NAVIYA BOT CONNECTED!             ║'));
            console.log(chalk.green.bold('╚════════════════════════════════════════════╝'));
            console.log(chalk.cyan('• Owner     : ') + chalk.white(global.namaown || 'Naviya'));
            console.log(chalk.cyan('• Bot Name  : ') + chalk.white(global.namabot || 'Naviya-Bot'));
            console.log(chalk.cyan('• Number    : ') + chalk.white('+' + botNumber));
            console.log('');
            
            // Bot එකටම message එකක් යැවීම
            const startupMsg = `*Naviya Bot Online!* 🚀\n\n` +
                               `👤 *Owner:* ${global.namaown}\n` +
                               `🤖 *Bot:* ${global.namabot}\n` +
                               `⏰ *Time:* ${new Date().toLocaleString()}`;
            
            sock.sendMessage(sock.user.id, { 'text': startupMsg });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.sendText = (jid, text, quoted = '', options) => sock.sendMessage(jid, { 'text': text, ...options }, { 'quoted': quoted });

    sock.downloadMediaMessage = async message => {
        let mime = (message.msg || message).mimetype || '';
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
        const stream = await downloadContentFromMessage(message, messageType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    };

    return sock;
}

StartNaviyaBot();

// Message Serializer Function
function smsg(sock, m, store) {
    if (!m) return m;
    let M = proto.WebMessageInfo;
    if (m.key) {
        m.id = m.key.id;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat?.endsWith('@g.us');
        m.sender = sock.decodeJid(m.fromMe && sock.user.id || m.participant || m.key.participant || m.chat || '');
    }
    if (m.message) {
        m.mtype = getContentType(m.message);
        m.msg = m.mtype === 'viewOnceMessage' ? m.message[m.mtype]?.message?.[getContentType(m.message[m.mtype]?.message)] : m.message[m.mtype];
        m.body = m.message?.conversation || m.msg?.text || m.msg?.caption || m.msg?.extendedTextMessage?.text || '';
        
        let quoted = m.quoted = m.msg?.contextInfo ? m.msg.contextInfo.quotedMessage : null;
        if (m.quoted) {
            let type = getContentType(quoted);
            m.quoted = m.quoted[type];
            m.quoted.mtype = type;
            m.quoted.id = m.msg.contextInfo?.stanzaId;
            m.quoted.chat = m.msg.contextInfo?.remoteJid || m.chat;
            m.quoted.sender = sock.decodeJid(m.msg.contextInfo?.participant);
            m.quoted.fromMe = m.quoted.sender === sock.decodeJid(sock.user.id);
            m.quoted.text = m.quoted?.text || m.quoted?.caption || '';
            m.quoted.download = () => sock.downloadMediaMessage(m.quoted);
        }
    }
    m.reply = (text, chatId = m.chat, options = {}) => sock.sendText(chatId, text, m, { ...options });
    return m;
}

// Auto-reload on file change
let file = require.resolve(__filename);
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    console.log(chalk.red(`Updated: ${__filename}`));
    delete require.cache[file];
    require(file);
});
