const os = require('os');
const { exec } = require('./exec');

async function unzip(src, dest) {
    if (os.platform() === "win32" || os.platform() === "win64") {
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