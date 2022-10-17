const { isWindowsOS } = require('./utils');
const { exec } = require('./exec');

async function unzip(src, dest) {
    if ( isWindowsOS ) {
        await exec('powershell', [
            '-command', 
            "& {&'Expand-Archive' " + src + " -DestinationPath " + dest + " -Force }"], {
                log: false
            });
    } else {
        await exec('unzip', [
            '-o', src, '-d', dest
        ], {
            log: false
        });
    }
}

module.exports = {
    unzip: unzip
}