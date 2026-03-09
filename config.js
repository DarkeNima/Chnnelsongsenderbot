/*
Base Whatsapp Bot
By Naviya 
*/

//~~~~~Setting Global~~~~~//

global.session_id = "DanuXxxii=XxxxxxXxXXxXxXXX" // ඔයාගේ Session ID එක මෙතනට දාන්න
global.prefix = '.' // බොට්ගේ Prefix එක
global.owner = ["947xxxxxxxxx"] // ඔයාගේ අංකය (Owner number)
global.bot = "947xxxxxxxxx" // බොට්ගේ අංකය (Bot number)
global.namabot = "Naviya-Bot" // බොට්ගේ නම
global.namaown = "Naviya" // ඔයාගේ නම

//~~~~~Status Updated~~~~~//
let fs = require('fs')
let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(`Update ${__filename}`)
    delete require.cache[file]
    require(file)
})
