const fs = require('fs');
const os = require('os');

function isWindowsOS() {
    return (os.platform() === "win32" || os.platform() === "win64");
}

async function readAndReplaceFileContent(path, writeFn) {
    const content = fs.readFileSync(path, 'utf-8');
    return Promise.resolve().then(() => {    
        return writeFn && writeFn(content);
    }).then((modifiedContent) => {
        if (modifiedContent !== undefined && modifiedContent !== null) {
            fs.writeFileSync(path, modifiedContent);
            return modifiedContent;
        }
        return content;
    });
}

async function iterateFiles(path, callBack) {
    if (fs.lstatSync(path).isDirectory()) {
        await Promise.all(fs.readdirSync(path).map((p) => iterateFiles(`${path}/${p}`, callBack)));
    } else {
        await callBack && callBack(path);
    }
}

module.exports = {
    isWindowsOS: isWindowsOS,
    readAndReplaceFileContent: readAndReplaceFileContent,
    iterateFiles: iterateFiles
};