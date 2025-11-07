const fileHandler = require('./FileHandler');

const jsYml = require('js-yaml');
const https = require("https");
const axios = require('axios');
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
        const result = await executeRequestAsync(url, 
            method, 
            headers, 
            request.jsonBody, 
            request.formUrlEncodedBody, 
            request.javascriptAssignments, 
            request.variableAssignments,
            insecure);
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
            if(wait.hours != undefined){
                msg += wait.hours + " hours ";
                totalWait += wait.hours * 60 * 60 * 1000;
            }
            if(wait.days != undefined){
                msg += wait.days + " days ";
                totalWait += wait.days * 24 * 60 * 60 * 1000;
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
    statusCodeEquals: function (exp, response, assertName) {
        exp = String(exp);
        var act = String(response.statusCode);
        if (act != exp) {
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

    responseContains: function (exp, response, assertName) {
        const expStr = String(exp);
        if(response == null || response.body == null){
            return {
                wasSuccess: false,
                assertName: assertName,
                message: "Could not find expected string '"+exp+"' in response since response was null"
            }
        }
        const responseStr = String(response.body);
        const success = responseStr.includes(expStr);
        if(!success){
            return {
                wasSuccess: false,
                assertName: assertName,
                message: "did not find expected string '"+expStr+"' in response body. response body was: " + responseStr
            }
        }

        return {
            wasSuccess: true,
            assertName: assertName,
            message: "did find expected string '" + expStr + "' in response body"
        };
    },

    responseIncludes: function(exp, response, assertName) {
        return this.responseContains(exp, response, assertName);
    },

    javascriptAsserts: function(exp, response, assertName){

        try{

        response = JSON.parse(response.body);
        }
        catch(e){
            response = response.body;
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
                success = eval(jsAssert.code);
            }
            catch(e){
                log(e);
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
    },

    codeAsserts: function (asserts, response, assertName) {
        try {

            response = JSON.parse(response.body);
        }
        catch (e) {
            response = response.body;
        }

        if (response == undefined) {
            return {
                wasSuccess: false,
                assertName: assertName,
                message: "response body is undefined"
            }
        }

        let results = [];
        for(var i = 0; i < asserts.length;i++){
            const assert = asserts[i];
            let success = false;
            try{
                success = tinyEval(assert.code, response);
            }
            catch(e){
                log("Error happened trying to intepret code expression, if you are sure that your expression is valid consider reverting to using the unsafe 'javascriptAsserts' instead, error: " + e);
                results.push({
                    wasSuccess: false,
                    assertName: assert.name,
                    message: "javascript assert failed while trying to run injected code: " + e.message
            });
                continue;
            }

            results.push({
                wasSuccess: success,
                assertName: assert.name,
                message: success == true ? "passed" : "code assert failed: " + assert.code
            })
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

async function executeRequestAsync(url, 
        method, 
        headers, 
        jsonBody, 
        formUrlEncodedBody, 
        javascriptAssignments, 
        variableAssignments, 
        insecure) {
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

    let javascriptVariableAssignments = getJavascriptAssignments(result.body, javascriptAssignments);
    if(javascriptVariableAssignments == null){
        javascriptVariableAssignments = [];
    }
    let tinyEvalVariableAssignments = getTinyEvalAssignments(result.body, variableAssignments);
    if(tinyEvalVariableAssignments == null){
        tinyEvalVariableAssignments = [];
    }
    result.variableAssignments = javascriptVariableAssignments.concat(tinyEvalVariableAssignments);

    return result;
}

function getTinyEvalAssignments(body, variableAssignments){
    var assignments = [];
    if(variableAssignments == null){
        return assignments;
    }
    if(body == null){
        return assignments;
    }

    let response = body;
    try{
        response = JSON.parse(body);
    }
    catch{
    }

    let assignment = {};
    let evaluated = {};
    for(var i = 0; i < variableAssignments.length;i++){
        assignment = variableAssignments[i];
        if(assignment.variableName == null){
            throw new Error("Invalid variable assignment: expected each variable assignment to have 'variableName' defined");
        }
        if(assignment.code == null){
            throw new Error("Invalid variable assignment: expected each variable assignment to have 'code' defined");
        }
        let evaluated = {};
        try{
            evaluated = tinyEval(assignment.code, response);
        }
        catch(e){
            log("Error while trying to evaluate variable assignment for vairable with name: " + assignment.variableName + ", and code: " + assignment.code + ", error:" + e);
            continue;
        }

        assignments.push(createVariableAssignment(assignment.variableName, evaluated));
    }

    return assignments;
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

function getJavascriptAssignments(body, javascriptAssignments){
    var assignments = [];
    if(javascriptAssignments == null){
        return assignments;
    }
    let setSessionVariable = (key, value) => {
        assignments.push(createVariableAssignment(key, value));
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

function createVariableAssignment(key, value){
    return {key: key, value: value};
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

function tinyEval(code, response){
    if(code == null){
        throwParamError("code cannot be null");
    }
    var ast = getAst(code);
    return evalAst(ast, response);
}

function getAst(code){
    let response = parse(code,0,null);
    return response.parsed;
}

function parse(code, iterator, parsed, scopePrecedence, stopSymbols){
    let c = '';
    let parseResponse = null;
    for(var i = iterator; i < code.length;i++){
        c = code[i];
        if(c == ' '){
            continue;
        }
        if(stopSymbols != null && stopSymbols.includes(c)){
            return parseResponse;
        }

        let parserMethodResponse = getParserMethod(code, i);
        let method = parserMethodResponse.method;
        let currentPrecedence = getPrecedenceByParserMethodId(parserMethodResponse.symbolId);
        if(currentPrecedence != null && currentPrecedence < scopePrecedence){
            return createParseResponse(parsed,iterator);
        }

        parseResponse = method(code,i,parsed, scopePrecedence, stopSymbols);
        parsed = parseResponse.parsed;
        i = parseResponse.iterator;
        iterator = i;
    }

    return createParseResponse(parsed, iterator);
}

function getPrecedenceByParserMethodId(symbolId){
    const isAndOr = ['&&','||'].includes(symbolId);
    if(isAndOr){
        return 1;
    }
    const isComparer = Object.values(comparers).includes(symbolId);
    if(isComparer){
        return 2;
    }
    if(symbolId == '.'){
        return 3;
    }
    if(symbolId == '+' || symbolId == '-'){
        return 4;
    }
    if(symbolId == '*' || symbolId == '/'){
        return 5;
    }
    if(symbolId == "new"){
        return 6;
    }

    return null;
}


function getParserMethod(code, iterator) {
    let method = null;
    const c = code[iterator];
    let methodKey = "";
    for (var j = maxLenParserIdentifiers; j >= 0; j--) {
        var tempI = iterator;
        methodKey = c;
        while (methodKey.length < j && tempI + 1 < code.length) {
            tempI++;
            methodKey += code[tempI];
        }
        method = stringParserMethodsMap[methodKey];
        if (method != null) {
            break;
        }
    }
    const noSymbolParserFound = method == null;
    if (noSymbolParserFound && validIdentifierChars.includes(c) || methodKey == "toString") {
        return createParserMethodResponse(parseIdent, "");
    }
    else if(noSymbolParserFound){
        throwParseError("No parser method found for symbol: " + c);
    }

    return createParserMethodResponse(method,methodKey);
}

function createParserMethodResponse(method,symbolIdentifier){
    return {
        method: method,
        symbolId: symbolIdentifier
    }
}

const maxLenParserIdentifiers = 3;
const stringParserMethodsMap  = {
    "0": parseNumber,
    "1": parseNumber,
    "2": parseNumber,
    "3": parseNumber,
    "4": parseNumber,
    "5": parseNumber,
    "6": parseNumber,
    "7": parseNumber,
    "8": parseNumber,
    "9": parseNumber,
    "==": parseComparison,
    "!=": parseComparison,
    ">": parseComparison,
    ">=": parseComparison,
    "<": parseComparison,
    "<=": parseComparison,
    "'": parseString,
    "\"": parseString,
    ".": parseAccessor,
    "(": parseEnclosing,
    "[": parseArrayAccessor,
    "!": parseInversion,
    "+": parseAdd,
    "-": parseSubstract,
    "*": parseMultiply,
    "/": parseDivision,
    "&&": parseAnd,
    "||": parseOr,
    "new": parseNew,
    "=>": parseLampda
}

const validIdentifierChars = "qwertyuiopåasdfghjklæøzxcvbnmQWERTYUIOPÅASDFGHJKLÆØZXCVBNM";
function parseIdent(code, iterator){
    let identStr = "";
    let c = "";
    for(;iterator < code.length;iterator++){
        c = code[iterator];
        if(!validIdentifierChars.includes(c)){
            break;
        }
        identStr += c;
    }
    if(c != " "){
        iterator--;
    }

    if(identStr == "false" || identStr == "true"){
        const val = identStr == "true";
        return createParseResponse(val, iterator);
    }
    if(identStr == "null" || identStr == "undefined"){
        const parsed = { type: nodeTypes.null };
        return createParseResponse(parsed, iterator);
    }

    const parsed = {type: nodeTypes.identifier, value: identStr};
    return createParseResponse(parsed, iterator);
}

function parseEnclosing(code, iterator, left, precedence, stopSymbols){
    assertCurrentCharIs('(', code, iterator);
    if(left != null){
        return parseFunction(code, iterator, left, precedence, stopSymbols);
    }

    iterator++;
    stopSymbols = [')'];
    precedence = 0;
    const insideEnclosingParsed = parse(code, iterator, null, precedence, stopSymbols);
    iterator = insideEnclosingParsed.iterator;
    iterator++;
    const parsed = { type: nodeTypes.enclosing, insideEnclosing: insideEnclosingParsed.parsed };
    return createParseResponse(parsed,iterator);
}

function parseFunction(code, iterator, left, precedence, stopSymbols){
    var args = [];
    iterator++;
    let c = "";
    let didBreakOnEnclosedParams = false;
    stopSymbols = [')',','];
    let argParseResponse = {};
    for(;iterator<code.length;iterator++){
        c = code[iterator];
        if(c == ')'){
            didBreakOnEnclosedParams = true;
            break;
        }
        else if(c == ','){
            continue;
        }
        argParseResponse = parse(code, iterator, null, null, stopSymbols);
        args.push(argParseResponse.parsed);
        iterator = argParseResponse.iterator;
    }

    if(!didBreakOnEnclosedParams){
        throwParseError("Expected parse of args to end with enclosing function symbol");
    }

    const parsed = {type: nodeTypes.function, name: left, args: args};
    return createParseResponse(parsed, iterator);
}

function parseArrayAccessor(code, iterator, left, precedence, stopSymbols){
    assertCurrentCharIs("[",code,iterator);
    iterator++;
    stopSymbols = ["]"]
    precedence = getPrecedenceByParserMethodId('.');
    const indexAccessorValue =  parse(code,iterator,null,precedence,stopSymbols)
    const parsed = { type: nodeTypes.arrayAccessor, array: left, accessorValue: indexAccessorValue.parsed };
    iterator = indexAccessorValue.iterator;
    iterator++;
    assertCurrentCharIs("]", code, iterator);
    return createParseResponse(parsed, iterator);
}

function parseInversion(code, iterator, left, precedence, stopSymbols){
    assertCurrentCharIs("!", code, iterator);
    iterator++;
    const toInvert = parse(code,iterator,null,null,stopSymbols);
    const parsed = { type: nodeTypes.inversion, toInvert: toInvert.parsed };
    iterator = toInvert.iterator;
    return createParseResponse(parsed, iterator);
}

function parseAdd(code, iterator, left, precedence, stopSymbols)
{
    return parseMathNodeType('+',nodeTypes.add, code, iterator, left, stopSymbols);
}

function parseSubstract(code, iterator, left, precedence, stopSymbols){
    return parseMathNodeType('-',nodeTypes.subtract, code, iterator, left, stopSymbols);
}

function parseMultiply(code, iterator, left, precedence, stopSymbols){
    return parseMathNodeType('*',nodeTypes.multiply, code, iterator, left, stopSymbols);
}

function parseDivision(code, iterator, left, precedence, stopSymbols){
    return parseMathNodeType('/',nodeTypes.division, code, iterator, left, stopSymbols);
}

function parseAnd(code, iterator, left, precedence, stopSymbols){
    return parseAndOr("&", nodeTypes.and, code, iterator, left, precedence, stopSymbols);
}

function parseOr(code, iterator, left, precedence, stopSymbols){
    return parseAndOr("|", nodeTypes.or, code, iterator, left, precedence, stopSymbols);
}

function parseAndOr(symbol, nodeType, code, iterator, left, precedence, stopSymbols){
    assertCurrentCharIs(symbol, code, iterator);
    iterator++;
    assertCurrentCharIs(symbol, code, iterator);
    iterator++;
    const rightParsedResponse = parse(code,iterator,null,precedence,stopSymbols);
    const parsed = {type: nodeType, left: left, right: rightParsedResponse.parsed};
    return createParseResponse(parsed, rightParsedResponse.iterator);
}

function parseNew(code, iterator, left, precedence, stopSymbols){
    const assertAndGoBeyond = "new ";
    for(var i = 0; i < assertAndGoBeyond.length;i++){
        assertCurrentCharIs(assertAndGoBeyond[i],code,iterator + i);
    }
    iterator += assertAndGoBeyond.length;
    precedence = getPrecedenceByParserMethodId("new");
    var rightHandFunctionResponse = parse(code,iterator,null,precedence,stopSymbols);
    var rightHandFunction = rightHandFunctionResponse.parsed;
    if(rightHandFunction.type != nodeTypes.function){
        throwParseError("error while parsing new: expected rigth hand side type to be function, but was: " + rightHandFunction.type);
    }
    const parsed = {type: nodeTypes.new, function: rightHandFunction };
    return createParseResponse(parsed, rightHandFunctionResponse.iterator);
}

function parseLampda(code, iterator, left, precedence, stopSymbols){
    //left is ident
    assertCurrentCharIs('=', code, iterator);
    iterator++;
    assertCurrentCharIs('>', code, iterator);
    iterator++;
    //right hand side is body
    const bodyParsedResponse = parse(code, iterator, null, precedence, stopSymbols);
    var bodyParsed = bodyParsedResponse.parsed;
    const parsed = {type: nodeTypes.lampda, left: left, body: bodyParsed };
    return createParseResponse(parsed, bodyParsedResponse.iterator);
}

function parseMathNodeType(symbol,nodeType, code,iterator,left,stopSymbols){
    assertCurrentCharIs(symbol, code, iterator);
    iterator++;
    precedence = getPrecedenceByParserMethodId(symbol);
    const rightParsed = parse(code,iterator,null,precedence,stopSymbols);
    const parsed = { type: nodeType, left: left, right: rightParsed.parsed};
    return createParseResponse(parsed, rightParsed.iterator);
}

function assertCurrentCharIs(char,code,iterator){
    if(code[iterator] == char){
        return;
    }

    throwParseError("expected char to be '"+char+"' at index "+iterator+" but was: '"+code[iterator]+"'");
}

const numberChars = "0123456789.";
function parseNumber(code, iterator){
    let numbStr = "";
    let newIteratorPos = 0;
    for(var i= iterator;i < code.length;i++){
        if(numberChars.includes(code[i]) == false){
            break;
        }
        numbStr += code[i];
        newIteratorPos = i;
    }
    if(numbStr.length < 1){
        throw new ParseError("expected atleast 1 char in numbStr");
    }

    const parsed = Number(numbStr);
    return createParseResponse(parsed,newIteratorPos);
}

const nodeTypes = {
    comparer: "comparer",
    accessor: "accessor",
    identifier: "identifier",
    function: "function",
    arrayAccessor: "arrayAccessor",
    inversion: "inversion",
    add: "add",
    multiply: "multiply",
    enclosing: "enclosing",
    division: "division",
    subtract: "subtract",
    and: "and",
    or: "or",
    null: "null",
    new: "new",
    lampda: "lampda"
}

const comparers = {
    equals: "==",
    notEquals: "!=",
    greaterThan: ">",
    greaterThanOrEquals: ">=",
    lessThan: "<",
    lessThanOrEquals: "<=",
}

function parseComparison(code, iterator, left, precedence, stopSymbols){
    let comparerStr = "";
    for(var i = iterator; i < code.length;i++){
        if(code[i] == ' '){
            break;
        }
        comparerStr += code[i];
        iterator++;
    }
    if(!Object.values(comparers).includes(comparerStr)){
        throwParseError("unsupported comparer: " + comparerStr);
    }
    precedence = getPrecedenceByParserMethodId(comparerStr);
    const rightResponse = parse(code, iterator,null,precedence,stopSymbols);
    const parsed = {type: nodeTypes.comparer, comparer: comparerStr, left: left, right: rightResponse.parsed };
    return createParseResponse(parsed, rightResponse.iterator);
}

function parseString(code, iterator){
    var startStrSymbol = code[iterator];
    if(startStrSymbol != "'" && startStrSymbol != '"'){
        throwParseError("Invalid string start symbol: "+startStrSymbol);
    }
    iterator++;
    let didDetectEndOfStr = false;
    let parsed = "";
    while(iterator < code.length){
        didDetectEndOfStr = code[iterator] == startStrSymbol;
        if(didDetectEndOfStr){
            break;
        }
        parsed += code[iterator];
        iterator++;
    }
    if(!didDetectEndOfStr){
        throwParseError("did not find expected string end symbol, expected to find: " + startStrSymbol);
    }

    return createParseResponse(parsed,iterator);
}

function parseAccessor(code, iterator, left, precedence, stopSymbols) {
    assertCurrentCharIs('.', code, iterator);
    iterator++;
    precedence = getPrecedenceByParserMethodId('.');
    const rightResponse = parse(code,iterator,left,precedence, stopSymbols);
    const right = rightResponse.parsed;
    const parsed = {type: nodeTypes.accessor, left: left, right: right};

    return createParseResponse(parsed, rightResponse.iterator);
}


function evalAst(node, response) {
    const variables = {
        response: response,
        Object: Object
    };
    const functions = {
        Date: CreateDate
    }
    var env = createEnv(variables, functions)
    return evalNode(node, env);
}

function evalNode(node, env){
    if(node.type == nodeTypes.comparer){
        return evalComparer(node, env);
    }
    else if(node.type == nodeTypes.accessor){
        return evalAccessor(node, env);
    }
    else if(node.type == nodeTypes.identifier){
        return evalIdentifier(node, env);
    }
    else if(node.type == nodeTypes.function){
        return evalFunction(node, env);
    }
    else if(node.type == nodeTypes.arrayAccessor){
        return evalArrayAccessor(node, env);
    }
    else if(node.type == nodeTypes.inversion){
        return evalInversion(node, env);
    }
    else if(node.type == nodeTypes.enclosing){
        return evalEnclosing(node, env);
    }
    else if(node.type == nodeTypes.add){
        return evalAdd(node, env);
    }
    else if(node.type == nodeTypes.subtract){
        return evalSubtract(node, env);
    }
    else if(node.type == nodeTypes.multiply){
        return evalMultiply(node, env);
    }
    else if(node.type == nodeTypes.division){
        return evalDivision(node, env);
    }
    else if(node.type == nodeTypes.and){
        return evalAnd(node, env);
    }
    else if(node.type == nodeTypes.or){
        return evalOr(node, env);
    }
    else if(node.type == nodeTypes.new){
        return evalNew(node, env);
    }
    else if (node.type == nodeTypes.null) {
        return null;
    }
    else if(typeof node == 'number'){
        return node;
    }
    else if(typeof node == "string"){
        return node;
    }
    else if(typeof node == "boolean"){
        return node;
    }
    else{
        throwEvalError("unsupported node type for eval: " + node.type);
    }
}

function evalComparer(node, env){
    var comparer = node.comparer;
    if(comparer == null){
        throwEvalError("expected comparer to have value for node: " + node);
    }
    const left = evalNode(node.left, env);
    const right = evalNode(node.right, env);
    if(comparer == comparers.equals){
        return left == right;
    }
    else if(comparer == comparers.notEquals){
        return left != right;
    }
    else if(comparer == comparers.greaterThan){
        return left > right;
    }
    else if(comparer == comparers.greaterThanOrEquals){
        return left >= right;
    }
    else if(comparer == comparers.lessThan){
        return left < right;
    }
    else if(comparer == comparers.lessThanOrEquals){
        return left <= right;
    }
    else{
        throwEvalError("unsupported comparer: " + comparer);
    }
}

function evalAccessor(node, env){
    const accessorScopeBeforeThisAccessor = env.currentAccessorScope;
    env.currentAccessorScope = evalNode(node.left, env);
    const response = evalNode(node.right, env);
    env.currentAccessorScope = accessorScopeBeforeThisAccessor;
    return response;
}

function evalFunction(node, env){
    const functionHasLampdaArg = node.args != null && node.args.some(a => a.type == nodeTypes.lampda);
    if(functionHasLampdaArg){
        return evalFunctionWithLampdaArgs(node, env);
    }

    var args = [];
    const accessorScopeBeforeThisAccessor = env.currentAccessorScope;

    env.currentAccessorScope = null;
    for(var i = 0; i < node.args.length;i++){
        args.push(evalNode(node.args[i], env));
    }
    const functionName = node.name.value;
    env.currentAccessorScope = accessorScopeBeforeThisAccessor;
    const shouldHandleAsAccessor = env.currentAccessorScope != null;
    if(shouldHandleAsAccessor){
        return env.currentAccessorScope[functionName].apply(env.currentAccessorScope, args);
    }
    else if(env.functions.hasOwnProperty(functionName)){
        return env.functions[functionName](args);
    }
    else{
        throwEvalError("no supported function found by name: " + functionName);
    }
}

function evalFunctionWithLampdaArgs(node, env){
    const initialAccessorScope = env.currentAccessorScope;
    if(initialAccessorScope == null){
        throwEvalError("exp current accessor scope to be defined when evaluating function with lampda args, but was null");
    }
    if(node.args.length != 1){
        throwEvalError("exp exactly one arg when evaluating function with lampda args - but was: " + node.args.length);
    }

    const lampdaArg = node.args[0];
    const functionName = node.name.value;
    if(functionName == "find"){
        return evalFindLampdaFunction(initialAccessorScope, lampdaArg, env);
    }
    else if(functionName == "filter"){
        return evalFilterLampdaFunction(initialAccessorScope, lampdaArg, env);
    }
    else if(functionName == "some"){
        return evalFindLampdaFunction(initialAccessorScope, lampdaArg, env) != null;
    }
    else{
        throwEvalError("unsupported lampda function: " + functionName);
    }
}

function evalFindLampdaFunction(arr, lampdaNode, parentEnv) {
    if (!Array.isArray(arr)) {
        throwEvalError("exp current accessor scope to be array-type on function with name: " + functionName);
    }
    const singleArrItemEnvKey = lampdaNode.left.value;
    for (let i = 0; i < arr.length; i++) {
        const childEnvVariables = {};
        childEnvVariables[singleArrItemEnvKey] = arr[i];
        const singleLampdaExeEnv = createChildEnv(parentEnv, childEnvVariables);
        const evaluated = evalNode(lampdaNode.body, singleLampdaExeEnv)
        if (evaluated) {
            return arr[i];
        }
    }
    return null;
}

function evalFilterLampdaFunction(arr, lampdaNode, parentEnv){
    if (!Array.isArray(arr)) {
        throwEvalError("exp current accessor scope to be array-type on function with name: " + functionName);
    }
    const singleArrItemEnvKey = lampdaNode.left.value;
    let filtered = [];
    for (let i = 0; i < arr.length; i++) {
        const childEnvVariables = {};
        childEnvVariables[singleArrItemEnvKey] = arr[i];
        const singleLampdaExeEnv = createChildEnv(parentEnv, childEnvVariables);
        const evaluated = evalNode(lampdaNode.body, singleLampdaExeEnv)
        if (evaluated) {
            filtered.push(arr[i]);
        }
    }
    return filtered;
}

function createChildEnv(parentEnv, variables, functions){
    var childEnv = createEnv(variables, functions);
    childEnv.parent = parentEnv;
    return childEnv;
}

function createEnv(variables, functions){
    return {
        variables: variables,
        functions: functions
    };
}

function evalArrayAccessor(node, env){
    const accessorVal = evalNode(node.accessorValue,env);
    const array = evalNode(node.array,env);
    return array[accessorVal];
}

function evalInversion(node, env){
    return !evalNode(node.toInvert, env);
}

function evalEnclosing(node, env){
    return evalNode(node.insideEnclosing, env);
}

function evalAdd(node, env){
    const left = evalNode(node.left, env);
    const right = evalNode(node.right, env);
    return left + right;
}

function evalSubtract(node, env){
    const left = evalNode(node.left, env);
    const right = evalNode(node.right, env);
    return left - right;
}

function evalMultiply(node, env){
    const left = evalNode(node.left, env);
    const right = evalNode(node.right, env);
    return left * right;
}

function evalDivision(node, env){
    const left = evalNode(node.left, env);
    const right = evalNode(node.right, env);
    return left / right;
}

function evalAnd(node, env){
    const left = evalNode(node.left, env);
    const right = evalNode(node.right, env);
    return left && right;
}

function evalOr(node, env){
    const left = evalNode(node.left, env);
    if(left){
        return true;
    }
    const right = evalNode(node.right, env);
    return left || right;
}

function evalNew(node, env){
    const toInvoke = node.function;
    if(toInvoke == null){
        throwEvalError("eval new expects node.function to not be null");
    }
    return evalNode(toInvoke, env);
}

function evalIdentifier(node, env){
    const identVal = node.value;
    if(env.currentAccessorScope != null){
        return env.currentAccessorScope[identVal];
    }
    const variableVal = env.variables[identVal];
    if(variableVal == null){
        throwEvalError("tried to access non-existing variable with key: " + identVal);
    }

    return variableVal;
}

function throwEvalError(msg){
    throwErrorWithPrefix("eval error: ", msg);
}

function throwParseError(msg){
    throwErrorWithPrefix("parser error: ", msg);
}

function throwParamError(msg){
    throwErrorWithPrefix("param error: ", msg);
}

function throwErrorWithPrefix(prefix, msg){
    throw new Error(prefix+msg);
}

function createParseResponse(parsed, iterator){
    return {
        iterator: iterator,
        parsed: parsed
    };
}

function CreateDate(arg){
    return new Date(arg);
}


module.exports = {
    run,
    ls
};
