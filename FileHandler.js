const fs = require('fs');
const jsYml = require('js-yaml');
const path = require('path');
const joinPathSegments = require('path').join;

function findHarpiYmlFile(fileName)
{
    const currentDir = process.cwd();
    const harpiYmlFile = searchDir(currentDir, fileName);
    return harpiYmlFile;
}

function searchDir(dir, harpiYmlFileName) {
    const files = fs.readdirSync(dir);
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = joinPathSegments(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            continue;
        } else if (file == harpiYmlFileName) {
            return filePath;
        }
    }
    return null;
}

const fileExt = '.harpi.yml';

function addFileExtensionIfNone(fileName)
{
    if (!fileName.endsWith(fileExt)) {
        return fileName += fileExt;
    }

	return fileName;
}

async function searchRecursivelyForAllHarpiYmlFiles(dir){
    let matches = [];
    const files = fs.readdirSync(dir);
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = joinPathSegments(dir , file);
        const stat = fs.statSync(filePath);
        if(stat.isDirectory()){
            var nestedMatches = searchRecursivelyForAllHarpiYmlFiles(filePath);
            if(nestedMatches.length > 0)
                matches = matches.concat(nestedMatches);
        }
        else if(filePath.endsWith(fileExt)){
            matches.push(filePath);
        }
    }
    return matches;
}

function readFileSync(file)
{
    return fs.readFileSync(file, 'utf8');
}

function saveNewSession(dynamicVariables, harpiFileDir, harpiFileName, logFunction){
    ensureSessionFileStructureExists(harpiFileDir);
    const sessionFilePath = getSessionFilePath(harpiFileDir, harpiFileName);
    if(logFunction != undefined)
        logFunction("saving new session at: " + sessionFilePath);
    if(Object.keys(dynamicVariables).length < 1){
        fs.writeFileSync(sessionFilePath, "");
    }
    else{
        fs.writeFileSync(sessionFilePath, jsYml.dump(dynamicVariables));
    }
}

const harpiSessionFileNamePrefix = "session.";
function getSessionFilePath(harpiFileDir, harpiFileName){
    return joinPathSegments(harpiFileDir, 
        harpiDirName, 
        harpiSessionFileNamePrefix + 
        harpiFileName);
}

const harpiGitIgnoreFileName = "harpi.gitignore";
const harpiDirName = "harpiconfig";
function ensureSessionFileStructureExists(harpiFileDir){
    const gitIgnoreFilePath = joinPathSegments(harpiFileDir, harpiGitIgnoreFileName);
    if(!fs.existsSync(gitIgnoreFilePath)){
        fs.writeFileSync(gitIgnoreFilePath, harpiDirName + "/");
    }
	var harpiDir = joinPathSegments(harpiFileDir, harpiDirName);
    if(!fs.existsSync(harpiDir)){
        fs.mkdirSync(harpiDir);
    }
}

function writeFileSync(path, content){
    fs.writeFileSync(path, content);
}

function writeLogFileSync(fileName, logStr){
    let filePath = fileName;
    if(!isFilePath(fileName)){
        const currentDir = process.cwd();
        filePath = joinPathSegments(currentDir, fileName);
    }

    writeFileSync(filePath, logStr);
}

function isFilePath(filePath) {
  return path.parse(filePath).ext !== '';
};

module.exports = {
	findHarpiYmlFile,
	addFileExtensionIfNone,
	searchRecursivelyForAllHarpiYmlFiles,
	readFileSync,
	saveNewSession,
    writeFileSync,
    writeLogFileSync
};