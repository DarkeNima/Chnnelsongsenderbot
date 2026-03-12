/*
Base Whatsapp Bot
By Naviya 
*/

//~~~~~Setting Global~~~~~//

global.session_id = "VAJIRA-MD=RQMknKhZ#5sNhIlbzqfUW8vIV1gvfeMOnctlHwZHvjG3wCAULiJQ" // ඔයාගේ Session ID එක මෙතනට දාන්න
global.prefix = '.' // බොට්ගේ Prefix එක
global.owner = ["94755669688"] // ඔයාගේ අංකය (Owner number)
global.bot = "94755669688" // බොට්ගේ අංකය (Bot number)
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
