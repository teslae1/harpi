

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

	it("Should interpret code expressions correctly ", async () => {
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
				code: "'str'.includes('str')",
				responseBody: "",
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
				code: "!'str'.includes('str')",
				responseBody: "",
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
			}
		]

		tests.forEach(async test => {
			const yml = 
			"requests:\n" +
			"  - url: https://t.com\n" +
			"    method: get\n" + 
			"    asserts:\n" +
			"      codeAsserts:\n" + 
			"        - code: \""+test.code+"\"\n";

			const result = await getSingleRunResultAsync(yml, test.responseBody);
			if(result != test.expectedExitCode){
    			const redText = '\x1b[31m';
    			const resetColor = '\x1b[0m';
				throw new Error(redText + "exp '"+test.expectedExitCode+"' but got '"+result+"'. code was: |" +test.code+ "|, response was: " + test.responseBody + resetColor);
			}
		});
	});

	it("Should support assert: responseContains", async () => {
		//define yml 

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

	async function getSingleRunResultAsync(ymlStr, firstResponseBody)
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
		return await run(filename,bail=true);
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
