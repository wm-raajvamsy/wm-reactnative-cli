const os = require('os');
const { exec } = require('./exec');

async function unZip(src, dest) {
    (os.platform() === "win32" || os.platform() === "win64") ? await exec('powershell', ['-command', "& {&'Expand-Archive' " + src + " -DestinationPath " + dest + " -Force }"]) :
        await exec('unzip', [
            '-o',
            src,
            '-d',
            dest
        ], {
            log: false
        });
}

module.exports = {
    unZip: unZip
}