const { isWindowsOS } = require('./utils');
const { exec } = require('./exec');
const extract = require('extract-zip');

async function unzip(src, dest) {
    if ( isWindowsOS() ) {
        await extract(src, { dir: dest});
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