

const { run, ls } = require('../harpiFunctions');
const axios = require('axios');
const fileHandler = require('../FileHandler');
const joinPathSegments = require('path').join;

const fakeFilePath = "testfile.harpi.yml";
var getRequestUrl = "https://www.get.com/api/get";
let harpiYml = 
    "requests: \n" + 
    `  - url: '${getRequestUrl}'\n` + 
    "    method: get";


//mock the axios function to when called with options where method is get and data is "myjson" return a result async
jest.mock('axios');

jest.mock('../FileHandler', () => ({
}));


describe('harpiFunctions.js', () =>{
	beforeEach(() => {
		jest.resetAllMocks();
	});

	it("Should support variableAssignments using tinyeval", async () => {
		const yml = "variables:\n" +
			"  myDynamicVariable\n" +
			"requests:\n" +
			"  - url: t.com/api\n" +
			"    method: get\n" +
			"    variableAssignments:\n" +
			"       - variableName: myDynamicVariable\n" +
			"         code: 'response.number'";

		const expectAssignment = 4;
		const response = {number: expectAssignment};
		const responseJson = JSON.stringify(response);
		axios.mockImplementation(() => {
			return Promise.resolve({
				data: responseJson,
				status: 200
			})
		});

		fileHandler.addFileExtensionIfNone = jest.fn(file => file);
		fileHandler.findHarpiYmlFile = jest.fn(file => file);
		fileHandler.readFileSync = jest.fn(file => yml);
		let actDynamicVariableAssignments = {};
		fileHandler.saveNewSession = jest.fn((dynamicVariables, harpiFileDir, harpiFileName, logFunction) => actDynamicVariableAssignments = dynamicVariables);

		const filename = "test";

		await run(filename);

		let actAssignment = actDynamicVariableAssignments["myDynamicVariable"];
		expect(actAssignment).toEqual(expectAssignment);

	});


	it("Should interpret string expressions correctly", async () => {
		var tests = [
			{
				code: "'str' == 'str'",
				responseBody: "",
				expectedExitCode: 0
			},
			{
				code: "'str' != 'str'",
				responseBody: "",
				expectedExitCode: 1 
			},
			{
				code: "'str'.length == 3",
				responseBody: "",
				expectedExitCode: 0
			},
			{
				code: "'str'.length > 2",
				responseBody: "",
				expectedExitCode: 0
			},
			{
				code: "'str'.length <= 2",
				responseBody: "",
				expectedExitCode: 1
			},
			{
				code: "'str'.includes('str')",
				responseBody: "",
				expectedExitCode: 0
			},
			{
				code: "!'str'.includes('str')",
				responseBody: "",
				expectedExitCode: 1
			},
		];

		await runInterpretExpressionTests(tests);
	});

	it("Should interpret boolean expressions correctly", async () => {
		var tests = [
			{
				code: "true",
				responseBody: "",
				expectedExitCode: 0
			},
			{
				code: "false",
				responseBody: "",
				expectedExitCode: 1
			},
			{
				code: "true == false",
				responseBody: "",
				expectedExitCode: 1
			},
			{
				code: "!true == false",
				responseBody: "",
				expectedExitCode: 0
			},
			{
				code: "(!true || false) == false",
				responseBody: "",
				expectedExitCode: 0
			}
		];
		await runInterpretExpressionTests(tests);
	});

	it("Should interpret number expressions correctly", async () => {
		var tests = [
			{
				code: "0 == 0",
				responseBody: "",
				expectedExitCode: 0
			},
			{
				code: "1 != 1",
				responseBody: "",
				expectedExitCode: 1 
			},
			{
				code: "1 != 0",
				responseBody: "",
				expectedExitCode: 0 
			},
			{
				code: "2 > 1",
				responseBody: "",
				expectedExitCode: 0
			},
			{
				code: "2 < 1",
				responseBody: "",
				expectedExitCode: 1
			},
			{
				code: "2 <= 2",
				responseBody: "",
				expectedExitCode: 0
			},
			{
				code: "2 > 2",
				responseBody: "",
				expectedExitCode: 1
			},
			{
				code: "2 >= 2",
				responseBody: "",
				expectedExitCode: 0
			},
			{
				code: "2.2 > 2.1",
				responseBody: "",
				expectedExitCode: 0 
			},
			{
				code: "2.2 < 2.1",
				responseBody: "",
				expectedExitCode: 1
			},
			{
				code: "(1.1 + 1) > 2.1",
				responseBody: "",
				expectedExitCode: 1
			},
			{
				code: "(1.1 + 1) <= 2.1",
				responseBody: "",
				expectedExitCode: 0 
			},
			{
				code: "2 * 2 + 2 == 6",
				responseBody: "",
				expectedExitCode: 0 
			},
			{
				code: "2 + 2 * 2 == 6",
				responseBody: "",
				expectedExitCode: 0 
			},
			{
				code: "(2 + 2) * 2 == 8",
				responseBody: "",
				expectedExitCode: 0 
			},
			{
				code: "4 / 2 + 1 == 3",
				responseBody: "",
				expectedExitCode: 0 
			},
			{
				code: "1 + 4 / 2 == 3",
				responseBody: "",
				expectedExitCode: 0 
			},
			{
				code: "4 / (2 + 1) == 1.3333333333333333",
				responseBody: "",

				expectedExitCode: 0 
			},
			{
				code: "4 / (2 - 1) == 4",
				responseBody: "",

				expectedExitCode: 0 
			},
			{
				code: "0 == 0 && 2 == 2",
				responseBody: "",
				expectedExitCode: 0 
			},
			{
				code: "0 == 1 && 2 == 2",
				responseBody: "",
				expectedExitCode: 1 
			},
			{
				code: "0 == 1 || 2 == 2",
				responseBody: "",
				expectedExitCode: 0
			},
		];

		await runInterpretExpressionTests(tests);
	});

	it("Should interpret object expressions correctly", async () => {
		const tests = [
			{
				code: "Object.values(response).includes('val2')",
				responseBody: JSON.stringify(
					{
						key1: "val1",
						key2: "val2"
					}
				),
				expectedExitCode: 0
			},
			{
				code: "Object.values(response).includes('val256')",
				responseBody: JSON.stringify(
					{
						key1: "val1",
						key2: "val2"
					}
				),
				expectedExitCode: 1 
			}
		];
		await runInterpretExpressionTests(tests);
	});

	it("Should interpret response expressions correctly ", async () => {
		const tests = [
			{
				code: "response.isActive == false",
				responseBody: JSON.stringify({
					isActive: false
				}),
				expectedExitCode: 0
			},
			{
				code: "response.isActive != false",
				responseBody: JSON.stringify({
					isActive: false
				}),
				expectedExitCode: 1 
			},
			{
				code: "response.isActive == true",
				responseBody: JSON.stringify({
					isActive: true
				}),
				expectedExitCode: 0
			},
			{
				code: "response.isActive != true",
				responseBody: JSON.stringify({
					isActive: true
				}),
				expectedExitCode: 1
			},
			{
				code: "response.value.length > 0",
				responseBody: JSON.stringify({
					value: [
						{}
					]
				}),
				expectedExitCode: 0
			},
			{
				code: "response.value.length > 0",
				responseBody: JSON.stringify({
					value: []
				}),
				expectedExitCode: 1
			},
			{
				code: "response.value.length == 5",
				responseBody: JSON.stringify({
					value: "mystr"
				}),
				expectedExitCode: 0
			},
			{
				code: "response.value.length < 5",
				responseBody: JSON.stringify({
					value: "mystr"
				}),
				expectedExitCode: 1 
			},
			{
				code: "response.value[0] == 1",
				responseBody: JSON.stringify({
					value: [1]
				}),
				expectedExitCode: 0 
			},
			{
				code: "response.value[0].Description.includes('DESCRIPTION')",
				responseBody: JSON.stringify({
					value: [
						{
							Description: "DESCRIPTION"
						}
					]
				}),
				expectedExitCode: 0 
			},
			{
				code: "response.value[0].Description.includes('DESCRIPTION') == false",
				responseBody: JSON.stringify({
					value: [
						{
							Description: "DESCRIPTION"
						}
					]
				}),
				expectedExitCode: 1
			},
			{
				code: "response.value[0].Description.includes('NOTINCLUDED_DESCRIPTION')",
				responseBody: JSON.stringify({
					value: [
						{
							Description: "DESCRIPTION"
						}
					]
				}),
				expectedExitCode: 1
			},
			{
				code: "!response.value[0].Description.includes('NOTINCLUDED_DESCRIPTION')",
				responseBody: JSON.stringify({
					value: [
						{
							Description: "DESCRIPTION"
						}
					]
				}),
				expectedExitCode: 0
			},
			{
				code: "(response.value[0].Description == null) || (response.value[0].Description.includes('NOTINCLUDED_DESCRIPTION'))",
				responseBody: JSON.stringify({
					value: [
						{
							Description: "DESCRIPTION"
						}
					]
				}),
				expectedExitCode: 1
			},
			{
				code: "(response.value[0].Description == null) || (response.value[0].Description.includes('NOTINCLUDED_DESCRIPTION'))",
				responseBody: JSON.stringify({
					value: [
						{
							Description: null
						}
					]
				}),
				expectedExitCode: 0
			},
			{
				code: "response.value[0].isActive == null || response.value[0].isActive == false",
				responseBody: JSON.stringify({
					value: [
						{
							isActive: false
						}
					]
				}),
				expectedExitCode: 0
			},
			{
				code: "response.value[0].isActive == null && response.value[0].isActive == false",
				responseBody: JSON.stringify({
					value: [
						{
							isActive: false
						}
					]
				}),
				expectedExitCode: 1 
			},
			{
				code: "response.includes('hi')",
				responseBody: "hi there",
				expectedExitCode: 0
			},
			{
				code: "response.number.toString() == '1'",
				responseBody: JSON.stringify({
					number: 1
				}),
				expectedExitCode: 0
			},
			{
				code: "response.number.toString() == '2'",
				responseBody: JSON.stringify({
					number: 1
				}),
				expectedExitCode: 1
			},
			{
				code: "new Date(response[0].timeGenerated) > new Date('2025-10-02T00:00:00.9625552+00:00')",
				responseBody: JSON.stringify(
					[
						{
							timeGenerated: '2025-10-03T00:00:00.9625552+00:00'
						}
					]
				),
				expectedExitCode: 0
			},
			{
				code: "new Date(response[0].timeGenerated) < new Date('2025-10-02T00:00:00.9625552+00:00')",
				responseBody: JSON.stringify(
					[
						{
							timeGenerated: '2025-10-03T00:00:00.9625552+00:00'
						}
					]
				),
				expectedExitCode: 1
			},
			{
				code: "Date(response[0].timeGenerated) > Date('2025-10-02T00:00:00.9625552+00:00')",
				responseBody: JSON.stringify(
					[
						{
							timeGenerated: '2025-10-03T00:00:00.9625552+00:00'
						}
					]
				),
				expectedExitCode: 0
			},
			{
				code: "Date(response[0].timeGenerated) < Date('2025-10-02T00:00:00.9625552+00:00')",
				responseBody: JSON.stringify(
					[
						{
							timeGenerated: '2025-10-03T00:00:00.9625552+00:00'
						}
					]
				),
				expectedExitCode: 1
			},
			{
				code: "response.revisionResponsiblePersonEmail == null",
				responseBody: JSON.stringify(
					{
						revisionResponsiblePersonEmail: null
					}
				),
				expectedExitCode: 0
			},
			{
				code: "response.incomingText.substring(0,8) == 'responseOTHERTEXT'.substring(0,8)",
				responseBody: JSON.stringify(
					{
						incomingText: "responsetext"
					}
				),
				expectedExitCode: 0
			},
			{
				code: "response.incomingText.substring(0,9) == 'responseOTHERTEXT'.substring(0,9)",
				responseBody: JSON.stringify(
					{
						incomingText: "responsetext"
					}
				),
				expectedExitCode: 1
			},
			{
				code: "response.find(r => r.id == '1').children.length == 2 && response.find(r => r.id == '1').children[0] == 'firstChildVal'",
				responseBody: JSON.stringify(
					[
						{
							id: "1",
							children: [
								"firstChildVal",
								"secondChildVal"
							]
						},
						{
							id: "2"
						}
					]
				),
				expectedExitCode: 0
			},
			{
				code: "response.filter(r => r.title == 'commonTitle').length == 2",
				responseBody: JSON.stringify(
					[
						{
							title: "commonTitle",
						},
						{
							title: "commonTitle",
						},
						{
							title: "UNcommonTitle",
						}
					]
				),
				expectedExitCode: 0
			},
			{
				code: "response.filter(r => r.title == 'commonTitle' && r.number == 4).length == 1",
				responseBody: JSON.stringify(
					[
						{
							title: "commonTitle",
							number: 4
						},
						{
							title: "commonTitle",
						},
						{
							title: "UNcommonTitle",
						}
					]
				),
				expectedExitCode: 0
			},
			{
				code: "code: response.filter(r => r.title == 'commonTitle').length == 2",
				responseBody: JSON.stringify(
					[
						{
							title: "commonTitle",
						},
						{
							title: "commonTitle",
						},
						{
							title: "commonTitle",
						}
					]
				),
				expectedExitCode: 1
			},
			{
				code: "response.some(r => r.isActive)",
				responseBody: JSON.stringify(
					[
						{
							isActive: false
						},
						{
							isActive: false
						},
						{
							isActive: true
						}
					]
				),
				expectedExitCode: 0
			},
			{
				code: "response.some(r => r.isActive)",
				responseBody: JSON.stringify(
					[
						{
							isActive: false
						},
						{
							isActive: false
						},
						{
							isActive: false
						}
					]
				),
				expectedExitCode: 1
			},
			{
				code: "response.some(r => new Date(r.timeGenerated).getTime() == new Date('2025-10-03T00:00:00.9625552+00:00').getTime())",
				responseBody: JSON.stringify(
					[
						{
							timeGenerated: '2025-10-03T00:00:00.9625552+00:00'
						}
					]
				),
				expectedExitCode: 0
			},
			{
				code: "response.data.find(r => r.number == response.bestNumber).id == 4",
				responseBody: JSON.stringify(
					{
						bestNumber: 3,
						data: [
							{
								id: 3,
								number:2 
							},
							{
								id: 4,
								number: 3
							}
						]
					}
				),
				expectedExitCode: 0
			},
		];

		await runInterpretExpressionTests(tests);
	});

	async function runInterpretExpressionTests(tests)	{
		for (const test of tests) {

			const yml =
				"requests:\n" +
				"  - url: https://t.com\n" +
				"    method: get\n" +
				"    asserts:\n" +
				"      codeAsserts:\n" +
				"        - code: \"" + test.code + "\"\n";

			let logStr = "";
			var logFunction = (msg) => {
				logStr += "\n" + msg;
			}

			const result = await getSingleRunResultAsync(yml, test.responseBody, logFunction);
			if (result != test.expectedExitCode) {
				const redText = '\x1b[31m';
				const resetColor = '\x1b[0m';
				throw new Error(redText + "exp '" + test.expectedExitCode + "' but got '" + result + "'. code was: |" + test.code + "|, response was: " + test.responseBody + "\n log: " + logStr + resetColor);
			}
		}
	}

	it("Should support assert: responseContains", async () => {

		const yml =
			"requests:\n" +
			"  - url: https://t.com\n" +
			"    method: get\n" + 
			"    asserts:\n" +
			"      responseContains: 'IN RESPONSE'\n";
			var responseBody = "this is IN RESPONSE";

		 const actResult = await getSingleRunResultAsync(yml,responseBody);
		 expect(actResult).toEqual(0);

		const ymlWhereAssertFails =
			"requests:\n" +
			"  - url: https://t.com\n" +
			"    method: get\n" + 
			"    asserts:\n" +
			"      responseContains: 'NOT IN RESPONSE'\n";

		 const failedActResult = await getSingleRunResultAsync(ymlWhereAssertFails,responseBody);
		 expect(failedActResult).toEqual(1);
	});

	async function getSingleRunResultAsync(ymlStr, firstResponseBody, logFunction)
	{
		const filename = "file";
		fileHandler.readFileSync = jest.fn(file => ymlStr);
		fileHandler.findHarpiYmlFile = jest.fn(file => filename);
		fileHandler.addFileExtensionIfNone = jest.fn(file => file);
		axios.mockImplementation(() => {
			return Promise.resolve({
				data: firstResponseBody,
				status: 200
			})
		});
		return await run(filename,null,true,null,null,true,false,logFunction);
	}

	it("Should send expected requests", async () => {
		tests = [
			{
				name: "phonenumber 123 should be removed if jsonbody usage as int(without quote encasing)",
				yml: 
				"variables: \n" +
				"  phonenumb: 12345678\n" + 
				"\n" + 
				"requests:\n" + 
				"  - url: \"https://t.com\"\n" +
				"    method: post\n" +
				"    jsonBody:\n" + 
				"      phonenumb: $(phonenumb)\n",
				assert: (requests, name) => {
					if(requests.length != 1){
						throw new Error("Expected exactly 1 request: " + name);
					}
					const req = requests[0];
					const data = req.data;
					const phoneNumbVal = data["phonenumb"];
					expect(phoneNumbVal).toEqual(12345678)
				}
			},
			{
				name: "int input passed into part of header should not be encased in quotes",
				yml: 
				"variables: \n" +
				"  minute: 1\n" + 
				"\n" + 
				"headers:\n"+
				"  time: \"minute: $(minute)\""+
				  "\n"+
				"requests:\n" + 
				"  - url: \"https://t.com\"\n" +
				"    method: get\n",
				assert: (requests, name) => {
					if(requests.length != 1){
						throw new Error("Expected exactly 1 request: " + name);
					}
					const req = requests[0];
					const headers = req.headers;
					const val = headers["time"];
					expect(val).toEqual('minute: 1');
				}
			},
			{
				name: "str variable with numbers should not wrap in quotes everywhere",
				yml: 
				"variables: \n" +
				"  postalCode: \"8240\"\n" + 
				"\n" + 
				"requests:\n" + 
				"  - url: \"https://t.com/code=$(postalCode)\"\n" +
				"    method: get\n",
				assert: (requests, name) => {
					if(requests.length != 1){
						throw new Error("Expected exactly 1 request: " + name);
					}
					const req = requests[0];
					expect(req.url).toEqual("https://t.com/code=8240");

				}
			},
			{
				name: "int input from command line should be detected and used as int",
				cliParams: "minute=1",
				yml: 
				"variables: \n" +
				"  minute: required\n" + 
				"\n" + 
				"headers:\n"+
				"  time: \"minute: $(minute)\""+
				  "\n"+
				"requests:\n" + 
				"  - url: \"https://t.com\"\n" +
				"    method: get\n",
				assert: (requests, name) => {
					if(requests.length != 1){
						throw new Error("Expected exactly 1 request: " + name);
					}
					const req = requests[0];
					const headers = req.headers;
					const val = headers["time"];
					expect(val).toEqual('minute: 1');
				}
			},
		]

		fileHandler.addFileExtensionIfNone = jest.fn(file => file);
		fileHandler.findHarpiYmlFile = jest.fn(file => file);
		fileHandler.saveNewSession = jest.fn();

		tests.forEach(async test => {
			const yml = test.yml;
			fileHandler.readFileSync = jest.fn(file => yml);
        	const harpiYmlFile = "testfile";
        	const requestId = undefined;
        	const verbose = false;
        	const outputFile = undefined; 
			var requests = [];
			axios.mockImplementation(options => {
				requests.push(options);
			}); 
			const cliParams = test.cliParams;

			await run(harpiYmlFile, requestId, verbose,cliParams,outputFile,null,null,testLogFunction);

			test.assert(requests, test.name);
		});
	});

    it("Should exit zero when success", async () => {
		const fileWithFileExtension = "test.harpi.yml";
		fileHandler.addFileExtensionIfNone = jest.fn(file => fileWithFileExtension);
		fileHandler.findHarpiYmlFile = jest.fn(file => file);
		fileHandler.readFileSync = jest.fn(file => harpiYml);
        const harpiYmlFile = "testfile";
        const requestId = undefined;
        const verbose = false;
        const variables = "val";
        const outputFile = undefined; 

      	let exitCode = await run(harpiYmlFile, requestId, verbose, variables, outputFile, null,null,testLogFunction);

		expect(exitCode)
		.toEqual(0);
	});

	it("Should exit non zero when any failed test", async () => {
		const fileName = "file.harpi.yml";
		const requestId = undefined;
		const verbose = false;
		const variables = undefined;
		const outputFile = undefined;
		const bail = false;

		fileHandler.addFileExtensionIfNone = jest.fn(file => file);
		fileHandler.findHarpiYmlFile = jest.fn(file => file);
		fileHandler.saveNewSession = jest.fn();
		const requestUrl = "https://api.com/failedasserttest";
		fileHandler.readFileSync = jest.fn(file => {
			if(file == fileName){
				return "requests: \n" + 
				"  - url: '"+requestUrl+"' \n" +
				"    method: get \n" +
				"    asserts: \n" + 
				"      statusCodeEquals: 200\n";
			}
		});

		axios.mockImplementation(async options => {
			if(options.url == requestUrl){
				return {status: 404};
			}
		}); 

		let exitCode = await run(fileName, 
			requestId, 
			verbose, 
			variables, 
			outputFile, 
			bail,
			null,
			testLogFunction);

		expect(exitCode)
		.toEqual(1);
	});

	it("Should exit non zero when no file found", async () => {
		fileHandler.addFileExtensionIfNone = jest.fn();
		fileHandler.findHarpiYmlFile = jest.fn();

		let exitCode = await run("filename",null,null,null,null,null,null,testLogFunction);

		expect(exitCode)
		.toEqual(1);
	});

	it("Should support cli variables that contain equals at end", async () => {

		const expValue = "ouhou.houewf.ouhwef==";
		const fileName = "test.harpi.yml";
		const requestId = undefined;
		const verbose = false;
		const variables = "token="+expValue;
		const bail = false;
		const outfile = undefined;
		const harpiYml = "variables: \n" +
		"  token: required \n" +
		"headers:  \n" + 
		"  Authorization: 'Bearer $(token)' \n" + 
		"requests: \n" + 
    `  - url: '${getRequestUrl}'\n` + 
    "    method: get";

		fileHandler.addFileExtensionIfNone = jest.fn(file => file);
		fileHandler.findHarpiYmlFile = jest.fn(file => file);
		fileHandler.readFileSync = jest.fn(file => {
			if(file == fileName){
				return harpiYml;
			}
			return undefined;
		});
		fileHandler.saveNewSession = jest.fn();

		var requests = [];
		axios.mockImplementation(options => {
			requests.push(options);
		}); 

		await run(fileName, requestId, verbose, variables, outfile, bail, null,testLogFunction);

		const expHeaderVal = "Bearer " + expValue;
		const actHeaderVal = requests[0].headers["Authorization"];
		expect(actHeaderVal)
		.toEqual(expHeaderVal);
	});

    it("Should use filehandler to save log file", async () => {
		const fileWithFileExtension = "test.harpi.yml";
		const mockAddFileExtCall = jest.fn(file => fileWithFileExtension);
		fileHandler.addFileExtensionIfNone = mockAddFileExtCall;
        const harpiYmlFile = "testfile";
		fileHandler.findHarpiYmlFile = jest.fn(file => harpiYmlFile);
		fileHandler.readFileSync = jest.fn(file => {
			if(file == harpiYmlFile){
				return harpiYml;
			}
		});
		fileHandler.writeLogFileSync = jest.fn();

        const requestId = undefined;
        const verbose = true;
        const variables = "val";
        const outputFile = "logfile"; 

      	await run(harpiYmlFile, requestId, verbose, variables, outputFile, null,null, testLogFunction);

		expect(fileHandler.writeLogFileSync).toHaveBeenCalledTimes(1);
		expect(fileHandler.writeLogFileSync.mock.calls[0][0]).toEqual(outputFile);
	});

    it("Should use filehandler to get harpi yml file", async () => {

		const fileWithFileExtension = "test.harpi.yml";
		fileHandler.addFileExtensionIfNone = jest.fn(file => fileWithFileExtension) ;
		fileHandler.findHarpiYmlFile = jest.fn();
        const harpiYmlFile = "testfile";
        const requestId = undefined;
        const verbose = false;
        const variables = "val";
        const outputFile = undefined; 

      	await run(harpiYmlFile, requestId, verbose, variables, outputFile, null,null,testLogFunction);

		expect(fileHandler.addFileExtensionIfNone).toHaveBeenCalledTimes(1);
		expect(fileHandler.addFileExtensionIfNone).toHaveBeenCalledWith(harpiYmlFile);

		expect(fileHandler.findHarpiYmlFile).toHaveBeenCalledTimes(1);
		expect(fileHandler.findHarpiYmlFile).toHaveBeenCalledWith(fileWithFileExtension);
	});

});


function testLogFunction(msg){
}



`
started new run for file at 02/10/2025, 07.54.33
- request 
  - id: 1
  - url: https://t.com
  - method: get- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 6 ms
  - body: {
          "isActive": false
}
  - asserts
    - undefined: \x1b[32mpassed\x1b[0m- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 6 ms
  - body: {
          "isActive": false
}
  - asserts
    - undefined: \x1b[31mcode assert failed: response.isActive != false\x1b[0mDetected failed assert - stopping since bail- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 5 ms
  - body: {
          "isActive": true
}
  - asserts
    - undefined: \x1b[32mpassed\x1b[0m- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 5 ms
  - body: {
          "isActive": true
}
  - asserts
    - undefined: \x1b[31mcode assert failed: response.isActive != true\x1b[0mDetected failed assert - stopping since bail- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 5 ms
  - body: {
          "value": [
                    {}
          ]
}
  - asserts
    - undefined: \x1b[32mpassed\x1b[0m- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 5 ms
  - body: {
          "value": []
}
  - asserts
    - undefined: \x1b[31mcode assert failed: response.value.length > 0\x1b[0mDetected failed assert - stopping since bail- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 4 ms
  - body: {
          "value": [
                    1
          ]
}
  - asserts
    - undefined: \x1b[32mpassed\x1b[0m- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 5 ms
  - body: {
          "value": [
                    {
                              "Description": "DESCRIPTION"
                    }
          ]
}
  - asserts
    - undefined: \x1b[32mpassed\x1b[0m- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 5 ms
  - body: {
          "value": [
                    {
                              "Description": "DESCRIPTION"
                    }
          ]
}
  - asserts
    - undefined: \x1b[31mcode assert failed: response.value[0].Description.includes('DESCRIPTION') == false\x1b[0mDetected failed assert - stopping since bail- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 5 ms
  - body: {
          "value": [
                    {
                              "Description": "DESCRIPTION"
                    }
          ]
}
  - asserts
    - undefined: \x1b[31mcode assert failed: response.value[0].Description.includes('NOTINCLUDED_DESCRIPTION')\x1b[0mDetected failed assert - stopping since bail- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 4 ms
  - body: {
          "value": [
                    {
                              "Description": "DESCRIPTION"
                    }
          ]
}
  - asserts
    - undefined: \x1b[32mpassed\x1b[0m- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 4 ms
  - body: {
          "value": [
                    {
                              "Description": "DESCRIPTION"
                    }
          ]
}
  - asserts
    - undefined: \x1b[31mcode assert failed: (response.value[0].Description == null) || (response.value[0].Description.includes('NOTINCLUDED_DESCRIPTION'))\x1b[0mDetected failed assert - stopping since bail- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 3 ms
  - body: {
          "value": [
                    {
                              "Description": null
                    }
          ]
}
  - asserts
    - undefined: \x1b[32mpassed\x1b[0m- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 3 ms
  - body: {
          "value": [
                    {
                              "isActive": false
                    }
          ]
}
  - asserts
    - undefined: \x1b[32mpassed\x1b[0m- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 2 ms
  - body: {
          "value": [
                    {
                              "isActive": false
                    }
          ]
}
  - asserts
    - undefined: \x1b[31mcode assert failed: response.value[0].isActive == null && response.value[0].isActive == false\x1b[0mDetected failed assert - stopping since bailTypeError: Cannot read properties of undefined (reading 'apply')- response
  - statusCode: \x1b[32m200\x1b[0m
  - responseTime: 1 ms
  - body: {
          "value": "hi there"
}
  - asserts
    - undefined: \x1b[31mjavascript assert failed while trying to run injected code: Cannot read properties of undefined (reading 'apply')\x1b[0mDetected failed assert - stopping since bail`