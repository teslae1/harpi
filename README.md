# Harpi 
Harpi is a cli tool that executes *.harpi.yml files which are simple text based http request scripts.
The file format of the *.harpi.yml files support sending http requests and asserting response data. 
Example:
```yml
variables:
  baseAddress: "https://test.com"
  itemId: "1" 
  itemTitle: "item 1"

requests:
  - name: "create data"
    method: "post"
    url: "$(baseAddress)/api/data/$(itemId)"
    jsonBody: 
      title: "$(itemTitle)"

  - name: "verify data now available"
    method: "get"
    url: "$(baseAddress)/api/data/$(itemId)"
    asserts:
      statusCodeEquals: 200
      javascriptAsserts:
        - name: "has expected title" 
          code: "response.title == '$(itemTitle)'"
```
The file can then be executed by using the "run" command
```
harpi run mytestfile.harpi.yml
```
## Installing 
```
npm install harpi_cli -g
```
## Example
Download the example script to your current directory
```
curl -O https://raw.githubusercontent.com/teslae1/harpi/main/example.harpi.yml
```
List the requests of the script
```
harpi ls example.harpi.yml
```
Run the script 
```
harpi run example.harpi.yml -v
```
## Saving and using response data
It is possible to assign response data to a variable for later use:
```yml
variables:
  myResponseValue: #Assigned by first request
  baseAddress: "https://test.com"

requests:
  - name: "create data with auto generated id"
    method: "post"
    url: "$(baseAddress)/api/data"
    javascriptAssignments:
      - name: "save id of created item"
        code: "setSessionVariable('myResponseValue', response.id)"

  - name: "verify data now available at id"
    method: "get"
    url: "$(baseAddress)/api/data/$(myResponseValue)"
    asserts:
      statusCodeEquals: 200
```
## Executing an individual request
It is possible to execute a single request - using the "ls" command all the http requests are listed with an id:

```
$> harpi ls myfile.harpi.yml
$> - request
$>   - id: 1
$>   - url: $(baseAddress)/api/data
$>   - method: post
$> - request
$>   - id: 2
$>   - url: $(baseAddress)/api/data/$(myResponseValue)
$>   - method: get
```

It is then possible to only execute request 2:
```
$> harpi run myfile.harpi.yml 2
```
## Taking values as parameters
It is possible to take parameters from the command line - which then will be assigned to a variable. 
This is achieved by using the "required" keyword:

```yml
variables:
  token: required 
  apiKey: required

headers:
  Authorization: "Bearer $(token)"
  ApiKey: "$(apiKey)"

requests:
  - name: "verify data now available at id"
    method: "get"
    url: "https://test.com/api/data/2"
    asserts:
      statusCodeEquals: 200
```

This will now make it required to provide the defined variables when running the file:

```
$> harpi run myfile.harpi.yml --variables token=MYTOKEN,apiKey=MYAPIKEY
```

## Headers
Example of setting headers for all requests
```yml
variables:
  token: required 
  apiKey: required

headers:
  Authorization: "Bearer $(token)"
  ApiKey: "$(apiKey)"

requests:
  - name: "This request will have both the headers defined in header"
    method: "get"
    url: "https://test.com/api/data/2"
    asserts:
      statusCodeEquals: 200
  - name: "This request will also have both the headers defined in header"
    method: "get"
    url: "https://test.com/api/data/2"
    asserts:
      statusCodeEquals: 200
```

## Waiting between requests
It is possible to insert a wait between two requests:
```yml
variables:
  myResponseValue: #Assigned by first request
  baseAddress: "https://test.com"

requests:
  - name: "create data with auto generated id"
    method: "post"
    url: "https://test.com/api/data/1"
    #Waiting 500 milliseconds before executing next request
    waitBeforeNextRequest:
      name: "Waiting for data to be prepared"
      milliseconds: 500

  - name: "verify data now available at id"
    method: "get"
    url: "https://test.com/api/data/1"
    asserts:
      statusCodeEquals: 200
```

## Auto generated values
It is possible to auto generate values like guids and dates. 
The values will be regenerated whenever the first request is executed
```yml
variables:
  currentDate: $(date)
  dateFiveMinutesInFuture: $(date.addMinutes(5))
  autoGeneratedId: $(guid)
  
requests:
  - url: "https://test.com/api/data/$(autoGeneratedId)"
    method: "post"
    jsonBody:
      someDateProperty: "$(currentDate)"
      anotherDateProperty: "$(dateFiveMinutesInFuture)"
```

