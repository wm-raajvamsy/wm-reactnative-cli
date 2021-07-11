const path = require('path');
const fs = require('fs-extra');

module.exports = {
    src: '',
    buildType: '',
    logDirectory: '',
    outputDirectory: '',
    metaData: {},
    setMetaInfo: function(src) {
        console.log('into fn src ..' + src);
        src = path.resolve(src) + '/';
        const jsonPath = src + 'app.json';
        let data = fs.readFileSync(jsonPath);
        return JSON.parse(data);
    }
};