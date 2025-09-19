const fileHandler = require('./FileHandler');

const jsYml = require('js-yaml');
const https = require("https");
const axios = require('axios');
const localeval = require('localeval');
const { v4: uuidv4 } = require('uuid');
const qs = require('qs');


const failedExitCode = 1;
const sucessExitCode = 0;

async function run(harpiYmlFileName, 
    requestId, 
    verbose, 
    variables, 
    outputFile, 
    bail,
    insecure,
    logFunctionParam) {
    if (logFunctionParam != null) {
        logFunction = logFunctionParam;
    }

	harpiYmlFileName = fileHandler.addFileExtensionIfNone(harpiYmlFileName);
	const harpiYmlFile = fileHandler.findHarpiYmlFile(harpiYmlFileName);

    if(harpiYmlFile == null) {
        log("No file found");
        return failedExitCode;
    }
    const harpiYmlDir = harpiYmlFile.substring(0, harpiYmlFile.length - harpiYmlFileName.length - 1);

    const shouldCreateNewSession = requestId == undefined || requestId == 1;
    log("\nstarted new run for " + harpiYmlFileName + " at " + new Date().toLocaleString());
    let harpiYml = getHarpiFileObj(harpiYmlFile, variables, shouldCreateNewSession, harpiYmlDir, harpiYmlFileName, true);
    if(harpiYml == undefined){
        log("Error while building harpi file obj");
        return failedExitCode;
    }
    let headers = harpiYml.headers;

    const isSingleRequestExe = requestId != undefined;
    let totalAssertResults = [];
    for (let i = 0; i < harpiYml.requests.length; i++) {
        if(isSingleRequestExe && i + 1 != requestId){
            continue;
        }

        const request = harpiYml.requests[i];
        const url = request.url;
        const method = request.method;
        log("\n" + getRequestAsPrintable(i + 1, request, verbose));
        if (url == null) {
            throw "url is not specified for request " + i;
        }
        if (method == null) {
            throw "method is not specified for request " + i;
        }
        const result = await executeRequestAsync(url, method, headers, request.jsonBody, request.formUrlEncodedBody, request.javascriptAssignments, insecure);
        const assertResults = getAssertResults(request.asserts, result);
        totalAssertResults.push(...assertResults);
        printResult(result, assertResults, verbose);

        if(bail && assertResults.some(result => !result.wasSuccess)){
            log("Detected failed assert - stopping since bail");
            break;
        }

        const variableAssignments = result.variableAssignments;
        if(variableAssignments != undefined && variableAssignments.length > 0){
            saveVariableAssignmentsToSession(variableAssignments, harpiYml, harpiYmlDir, harpiYmlFileName);
            harpiYml = getHarpiFileObj(harpiYmlFile, variables, false, harpiYmlDir, harpiYmlFileName, true);
        }

        const wait = request.waitBeforeNextRequest;
        if(wait != undefined && !isSingleRequestExe){
            let totalWait = 0;
            let msg = "";
            if(wait.name != undefined){
                msg += "\n" + wait.name;
            }

            msg += "\n now waiting ";
            if(wait.milliseconds != undefined){
                msg += wait.milliseconds + " milliseconds ";
                totalWait += wait.milliseconds;
            }
            if(wait.seconds != undefined){
                msg += wait.seconds + " seconds ";
                totalWait += wait.seconds * 1000;
            }
            if(wait.minutes != undefined){
                msg += wait.minutes + " minutes ";
                totalWait += wait.minutes * 60 * 1000;
            }

            log(msg);

            await sleep(totalWait);
        }
    }

    if(outputFile != undefined){
        saveLogToFile(outputFile);
    }

    if(totalAssertResults.some(result => !result.wasSuccess)){
        return failedExitCode;
    }

    return sucessExitCode;
}

function saveVariableAssignmentsToSession(assignments, obj, harpiFileDir, harpiFileName)
{
    if(assignments.length < 1){
        return;
    }

    let variables = tryLoadDynamicAssignedVariables(harpiFileDir, harpiFileName);
    if(variables == undefined){
        variables = {};
    }

    for(var i = 0; i < assignments.length;i++){
        const assignment = assignments[i];
        let val = assignment.value;
        if(val == undefined){
            val = "";
        }
        variables[assignment.key] = val;
    }

	fileHandler.saveNewSession(variables, 
        harpiFileDir, 
        harpiFileName, 
        log);
}

async function sleep(milliseconds){
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

const requiredParamKey = "required";
function addParamVariables(variables, cliVariables){

    if(variables == undefined){
        return variables;
    }
    var requiredVariables = [];

    const keys = Object.keys(variables);
    for(var i = 0; i < keys.length;i++){
        const key = keys[i];
        if(variables[key] == requiredParamKey){
            requiredVariables.push(key);
        }
    }

    var keysFoundInCliParams = [];
    if(cliVariables != undefined){
        const keyValuePairsSeparatedByEquals = cliVariables.split(',');
        if(keyValuePairsSeparatedByEquals != null){
            for(var i = 0; i < keyValuePairsSeparatedByEquals.length;i++){
                const keyValStr = keyValuePairsSeparatedByEquals[i].split('=');
                const key = keyValStr[0];
                variables[key] = keyValStr.slice(1).join('=');
                keysFoundInCliParams.push(key);
            }
        }
    }
    for(var i = 0; i < requiredVariables.length;i++){
        const key = requiredVariables[i];
        if(keysFoundInCliParams.indexOf(key) == -1){
            throw "Required variable '" + key + "' not found in cli parameters";
        }
    }

    return variables;
}

const executableAssertMethods = {
    statusCodeEquals: function(exp, response, assertName) {
        exp = String(exp);
        var act = String(response.statusCode);
        if(act != exp){
            return {
                wasSuccess: false,
                assertName: assertName,
                message: "exp: " + exp + " act: " + act
            }
        }

        return {
            wasSuccess: true,
            assertName: assertName,
            message: "status code was " + exp
    };
},
    javascriptAsserts: function(exp, response, assertName){

        try{

        response = JSON.parse(response.body);
        }
        catch(e){
            response = response.body
        }

        if(response == undefined){
            return {
                wasSuccess: false,
                assertName: assertName,
                message: "response body is undefined"
        }
        }

        let results = [];
        for(var i = 0; i < exp.length;i++){
            const jsAssert = exp[i];
            let success = false;
            try{
                success = localeval(jsAssert.code, {response: response});
            }
            catch(e){
                results.push({
                    wasSuccess: false,
                    assertName: jsAssert.name,
                    message: "javascript assert failed while trying to run injected code: " + e.message
            });
                continue;
        }

        results.push( {
            wasSuccess: success,
            assertName: jsAssert.name,
            message: success == true ? "passed" : "javascript assert failed: " + jsAssert.code
        });
    }

        return results;
}
}

function getAssertResults(asserts, response){
    let results = [];
    if(asserts == null)
        return results;
    var assertMethods = Object.keys(asserts);

    for(var i = 0; i < assertMethods.length;i++){
        var assertName = assertMethods[i];
        const executableMethod = executableAssertMethods[assertName];
        if(executableMethod == undefined){
            results.push({
                wasSuccess: false,
                assertName: assertName,
                message: "assert method not found"
            });
            continue;
        }

        const exp = asserts[assertName];
        const result = executableMethod(exp, response, assertName);
        if(Array.isArray(result)){
            for(var j = 0; j < result.length;j++){
                results.push(result[j]);
            }
        }
        else{
            results.push(result);
        }
    }

    return results;
}

function getHarpiFileObj(harpiYmlFile, 
    cliParams, 
    createNewSession, 
    harpiFileDir, 
    harpiFileName, 
    doVariableSearchReplace){
	let ymlStr = fileHandler.readFileSync(harpiYmlFile);
    if(doVariableSearchReplace){
        ymlStr = replaceWithDynamics(ymlStr, createNewSession, harpiFileDir, harpiFileName);
    }
    var objWithoutReplaces = jsYml.load(ymlStr);
    if(objWithoutReplaces == undefined){
        return undefined;
    }
    var variables = objWithoutReplaces.variables;
    if(doVariableSearchReplace){
        variables = addParamVariables(variables, cliParams);
    }
    let keys  =[];
    if(variables != undefined){
        keys = Object.keys(variables);
    }
    for(var i = 0; i < keys.length;i++){
        const key = keys[i];
        ymlStr = ymlStr.replace(new RegExp("\\$\\(" + key + "\\)", "g"), variables[key]);
    }
    const obj = jsYml.load(ymlStr);
    obj.headers = obj.headers;
    if(obj.headers == undefined){
        obj.headers = {};
    }
    ensureValidRequests(obj.requests);
    return obj;
}

function ensureValidRequests(requests)
{
    if(requests == undefined || requests == null){
        return;
    }

    for(var i = 0;i < requests.length;i++){
        var method = requests[i].method;
        if(method == undefined || method == null || method.length < 1){
            throw Error("Request " + (i + 1) + " must have defined method");
        }
    }
}

const dynamics = {
    guid: () => {
        //generate and return new unique identifier (guid)
        return uuidv4();
    },
    date: () => {
        const date = new Date();
        return convertToYmlDate(date);
    }
};

const dynamicsWithParams = {
    'date.addMinutes': (params) => {
        let date = new Date();
        date = new Date(date.getTime() + params * 60000);
        return convertToYmlDate(date);
    }
}

function convertToYmlDate(date){
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function replaceWithDynamics(ymlStr, createNewSession, harpiFileDir, harpiFileName)
{
    const obj = jsYml.load(ymlStr);
    if(obj == undefined){
        return ymlStr;
    }
    if(obj.variables == undefined){
        return ymlStr;
    }
    if(!createNewSession){
        const ymlStrReplaced = tryReplaceWithCurrentSession(obj, harpiFileDir, harpiFileName);
        if(ymlStrReplaced != ""){
            return ymlStrReplaced;
        }
    }

    const dynamicVariables = getVariablesWithDynamicKeysReplacedWithDynamicallyGenerated(obj.variables);
    const dynamicVariableKeys = Object.keys(dynamicVariables);
    for(i = 0; i < dynamicVariableKeys.length;i++){
        const key = dynamicVariableKeys[i];
        obj.variables[key] = dynamicVariables[key];
    }
	fileHandler.saveNewSession(dynamicVariables, harpiFileDir, harpiFileName, log);
    return jsYml.dump(obj);
}

function getVariablesWithDynamicKeysReplacedWithDynamicallyGenerated(variables){
    const methodKeys = Object.keys(dynamics);
    const methodWithParamKeys = Object.keys(dynamicsWithParams);
    const replaced = {};
    let variableKeys = Object.keys(variables);
    for(var i = 0; i < variableKeys.length;i++){
        const key = variableKeys[i];
        const value = variables[key];
        if(typeof value !== "string"){
            continue;
        }
        if(!value.startsWith("$(")){
            continue;
        }
        if(!value.endsWith(")")){
            continue;
        }
        const method = value.substring(2, value.length - 1);
        if(methodKeys.includes(method)){
            replaced[key] = dynamics[method]();
            continue;
        }

        for(var j = 0; j < methodWithParamKeys.length;j++){
            const methodWithParamKey = methodWithParamKeys[j];
            if(method.startsWith(methodWithParamKey)){
                const paramsStr = method.substring(methodWithParamKey.length + 1, method.length - 1);
                const params = paramsStr.split(",");
                replaced[key] = dynamicsWithParams[methodWithParamKey](...params);
                continue;
            }
        }
    }

    return replaced;
}

function tryReplaceWithCurrentSession(obj, harpiFileDir, harpiFileName){
    let dynamicAssignedVariables = tryLoadDynamicAssignedVariables(harpiFileDir, harpiFileName);
    if(dynamicAssignedVariables == undefined){
        return "";
    }

    let keys = Object.keys(dynamicAssignedVariables);
    for(var i = 0; i < keys.length;i++){
        obj.variables[keys[i]] = dynamicAssignedVariables[keys[i]];
    }
    return jsYml.dump(obj);
}


function tryLoadDynamicAssignedVariables(harpiFileDir, harpiFileName){
    const sessionFilePath = getSessionFilePath(harpiFileDir, harpiFileName);
    try{
        const sessionYmlStr = fileHandler.readFileSync(sessionFilePath, 'utf8');
        return jsYml.load(sessionYmlStr);
    }
    catch(error){
        return undefined;
    }
}

const harpiDirName = "harpiconfig";
const harpiSessionFileNamePrefix = "session.";
function getSessionFilePath(harpiFileDir, harpiFileName){
    return harpiFileDir + "/" + harpiDirName + "/" + harpiSessionFileNamePrefix + harpiFileName;
}


function getRequestAsPrintable(orderId, request, verbose){
    let printable = "- request \n  - id: " + (orderId);
    if(request.name != undefined){
        printable += "\n  - name: '"+request.name+"'";
    }

    printable += "\n  - url: " + request.url + "\n  - method: " + request.method;


    let jsonBody = request.jsonBody;
    if(jsonBody == undefined){
        return printable;
    }
    jsonBody = JSON.stringify(jsonBody);

    printable += "\n  - body: ";
    if(verbose){
        printable += getLongJson(jsonBody, 10);
    }
    else{
        printable += getShortJson(jsonBody);
    }

    return printable;
}

const greenColor = "\x1b[32m";
const redColor = "\x1b[31m";
const yellowColor = "\x1b[33m";

function printResult(result, assertResults, verbose){
    let statusCodeColor = greenColor;
    const statusCode = result.statusCode;
    if(statusCode < 200 || statusCode > 299){
        statusCodeColor = statusCode > 499 ? redColor : yellowColor;
    }
    var printable = "";
    printable += "- response\n";
    if(statusCode == failedReadingResponseCode){
        statusCodeColor = redColor;
        printable += "  - " + statusCodeColor + "failed reading response, with error: "+result.errorMessage+" \x1b[0m\n ";  
        log(printable);
        return;
    }

    printable += "  - statusCode: " + statusCodeColor + result.statusCode + "\x1b[0m\n";
    printable += "  - responseTime: " + result.responseTime + " ms\n";
    printable += "  - body: ";
    if(verbose)
        printable += getLongJson(result.body, 10) + "\n";
    else
        printable += getShortJson(result.body) + "\n";

    for(var i = 0; i < assertResults.length;i++){
        if(i == 0){
            printable += "  - asserts\n";
        }
        const assertResult = assertResults[i];
        printable += "    - " + assertResult.assertName + ": " + (assertResult.wasSuccess ? greenColor : redColor) + assertResult.message + "\x1b[0m\n";
    }

    for(var i = 0; i < result.variableAssignments.length;i++){
        const variableAssignment = result.variableAssignments[i];
        if(i == 0){
            printable += "- resulting variable assignments\n";
        }
        printable += "  - " + variableAssignment.key + ": " + variableAssignment.value + "\n";
    }

    if(printable.endsWith("\n")){
        printable = printable.substring(0, printable.length - 1);
    }

    log(printable);
}

const shortJsonLength = 100;
function getShortJson(json){
    let shortJson = "";

    try{
        shortJson = JSON.stringify(JSON.parse(json));
    }catch(e){
        shortJson = json;
    }
    if(shortJson == undefined){
        shortJson = "";
    }

    try{
        if(shortJson.length > shortJsonLength){
            shortJson = shortJson.substring(0, shortJsonLength) + "...";
        }
    }
    catch(e){}

    return shortJson;
}

function getLongJson(json, indentation){
    try{
        return JSON.stringify(JSON.parse(json), null, indentation);
    }catch(e){
        return json;
    }
}

const failedReadingResponseCode = 666;
const axoisSelfSignedCertificateErrorCode = "DEPTH_ZERO_SELF_SIGNED_CERT";

let agent = undefined;

async function executeRequestAsync(url, method, headers, jsonBody, formUrlEncodedBody, javascriptAssignments, insecure) {
    let result = {}
    let requestHeaders = {};
    if(headers != undefined){
        const keys = Object.keys(headers);
        for(var i = 0; i < keys.length;i++){
            requestHeaders[keys[i]] = headers[keys[i]];
        }
    }
    let data = jsonBody;
    if(formUrlEncodedBody != undefined){
        data = qs.stringify(formUrlEncodedBody);
    }
    else if(jsonBody != undefined){
        requestHeaders["Content-Length"] = Buffer.byteLength(JSON.stringify(jsonBody));
    }

    const startTime = new Date().getTime();
    if (agent == undefined) {
        agent = new https.Agent({
            rejectUnauthorized: !insecure
        })
    }
    try{
        const options = {
            headers: requestHeaders,
            method: method,
            data: data,
            url: url,
            httpsAgent: agent
        };
        let res = await axios(options);
        const endTime = new Date().getTime();
        result.body = getDataAsStr(res.data);
        result.statusCode = res.status;
    } catch(error){
        try{
            if (error.code == axoisSelfSignedCertificateErrorCode) {
                result = createSelfSignedCertificateErrorResult();
            }
            else{
                result.body = getDataAsStr(error.response.data);
                result.statusCode = error.response.status;
            }
        }
        catch(error){
            result.errorMessage = error.message;
            result.statusCode = failedReadingResponseCode;
        }
    }
    const endTime = new Date().getTime();
    result.responseTime = endTime - startTime;
    result.variableAssignments = getVariableAssignments(result.body, javascriptAssignments);

    return result;
}

function getDataAsStr(data){
        if(typeof data != "string"){
            return JSON.stringify(data);
        }

        return data;
}

function createSelfSignedCertificateErrorResult(){
    return {
        statusCode: failedReadingResponseCode,
        errorMessage: "Self signed certificate error, to allow harpi to run "  + 
        "without self signed certificate run with the option --insecure"
    };
}

function getVariableAssignments(body, javascriptAssignments){
    var assignments = [];
    if(javascriptAssignments == undefined){
        return assignments;
    }
    let setSessionVariable = (key, value) => {
        assignments.push({
            key: key,
            value: value,
        });
    };

    let response = body;
    try{
        response = JSON.parse(body);
    }
    catch{
    }

    for(var i = 0; i < javascriptAssignments.length;i++){
        let assignmentTask = javascriptAssignments[i];
        try{
            eval(assignmentTask.code);
        }
        catch{

        }
    }

    return assignments;
}

async function ls(harpiYmlFile, verbose, variables){
    var matches = await fileHandler.searchRecursivelyForAllHarpiYmlFiles(process.cwd());
    const isSingleFileLs = harpiYmlFile != undefined && harpiYmlFile != null && harpiYmlFile.length > 0;
    if(isSingleFileLs){
        //matches should only contain one file which contains the text in harpiYmlFile
        matches = matches.filter(function (match) {
            return match.includes(harpiYmlFile);
        });
    }

    for(var m = 0; m < matches.length;m++){
        const harpiFilePath = matches[m];
        const fileName = getFileName(harpiFilePath);
        log("\n\n " + fileName);
        const fileDir = harpiFilePath.substring(0, harpiFilePath.length - fileName.length);
        const harpiFileObj = getHarpiFileObj(harpiFilePath, variables, false, fileDir, fileName, false);
        if(harpiFileObj == undefined){
            continue;
        }
        const requests = harpiFileObj.requests;
        if(requests.length > 0){
            for(var i = 0; i < requests.length;i++){
                log(getRequestAsPrintable(i + 1, requests[i], verbose));
            }
    }
    }
}

function getFileName(filePath){
    return filePath.substring(filePath.lastIndexOf('/') + 1);
}

let logStr = "";
let logFunction = (msg) => {console.log(msg)};
function log(msg){
    logFunction(msg);
    logStr += msg + "\n";
}

function saveLogToFile(filePath){
     fileHandler.writeLogFileSync(filePath, logStr);
}


module.exports = {
    run,
    ls
};
