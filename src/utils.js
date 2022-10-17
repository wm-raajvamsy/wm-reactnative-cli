const os = require('os');

function isWindowsOS() {
    return (os.platform() === "win32" || os.platform() === "win64");
}

module.exports = {
    isWindowsOS: isWindowsOS
}