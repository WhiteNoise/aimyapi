'use strict';

var module$1 = require('module');
var fs = require('fs');
var openai$1 = require('openai');
var path = require('path');
var quickjsEmscripten = require('quickjs-emscripten');
var ts = require('typescript');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
function _interopNamespaceDefault(e) {
	var n = Object.create(null);
	if (e) {
		Object.keys(e).forEach(function (k) {
			if (k !== 'default') {
				var d = Object.getOwnPropertyDescriptor(e, k);
				Object.defineProperty(n, k, d.get ? d : {
					enumerable: true,
					get: function () { return e[k]; }
				});
			}
		});
	}
	n.default = e;
	return Object.freeze(n);
}

var ts__namespace = /*#__PURE__*/_interopNamespaceDefault(ts);

var require$1 = (
			false
				? /* @__PURE__ */ module$1.createRequire((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href)))
				: require
		);

let promiseId = 0;
let openPromises = {};
function wrapPromise(vm, promise, beginAsyncProcess, endAsyncProcess) {
  promiseId += 1;
  const vmPromise = vm.newPromise();
  vmPromise._promiseId = promiseId;
  beginAsyncProcess();
  promise.then((...args) => {
    endAsyncProcess();
    const wrappedArgs = args.map((arg) => wrap(vm, arg, void 0, beginAsyncProcess, endAsyncProcess));
    openPromises[vmPromise._promiseId] = null;
    vmPromise.resolve(...wrappedArgs);
    wrappedArgs.forEach((arg) => arg.dispose());
  }).catch((...args) => {
    const wrappedArgs = args.map((arg) => wrap(vm, arg, void 0, beginAsyncProcess, endAsyncProcess));
    vmPromise.reject(...wrappedArgs);
    wrappedArgs.forEach((arg) => arg.dispose());
    openPromises[vmPromise._promiseId] = null;
  });
  vmPromise.settled.then(() => {
    endAsyncProcess();
    vm.runtime.executePendingJobs();
  });
  openPromises[promiseId] = vmPromise;
  return vmPromise.handle;
}
function rejectOpenPromises(vm) {
  for (const [id, promise] of Object.entries(openPromises)) {
    if (promise !== null) {
      promise.reject(vm.newError("Shutting down"));
      openPromises[id] = null;
    }
  }
  vm.runtime.executePendingJobs();
}
function wrap(vm, value, context, beginAsyncProcess, endAsyncProcess) {
  if (value === null) {
    return null;
  } else if (typeof value === "object" && typeof value.then === "function") {
    return wrapPromise(vm, value, beginAsyncProcess, endAsyncProcess);
  } else if (typeof value === "function") {
    return wrapGenericFunction(vm, value, context, beginAsyncProcess, endAsyncProcess);
  } else if (Array.isArray(value)) {
    return wrapArray(vm, value, beginAsyncProcess, endAsyncProcess);
  } else if (value === null) {
    return vm.null;
  } else if (typeof value === "object") {
    return wrapObject(vm, value, beginAsyncProcess, endAsyncProcess);
  } else if (typeof value === "string") {
    return vm.newString(value);
  } else if (typeof value === "number") {
    return vm.newNumber(value);
  } else if (typeof value === "bigint") {
    return vm.newBigInt(value);
  } else if (typeof value === "boolean") {
    return vm.evalCode(value ? "true" : "false").value;
  } else if (typeof value === "undefined") {
    return vm.undefined;
  } else {
    return null;
  }
}
function wrapObject(vm, obj, beginAsyncProcess, endAsyncProcess) {
  const vmObject = vm.newObject();
  for (const [key, value] of Object.entries(obj)) {
    let wrappedValue = wrap(vm, value, obj, beginAsyncProcess, endAsyncProcess);
    if (wrappedValue !== null) {
      vm.setProp(vmObject, key, wrappedValue);
      if (wrappedValue != vm.undefined && wrappedValue != vm.null && wrappedValue.dispose) {
        wrappedValue.dispose();
      }
    }
  }
  return vmObject;
}
function wrapObjectWhitelist(vm, obj, whitelist, beginAsyncProcess, endAsyncProcess) {
  const vmObject = vm.newObject();
  whitelist.forEach((key) => {
    const value = obj[key];
    const wrappedValue = wrap(vm, value, obj, beginAsyncProcess, endAsyncProcess);
    if (wrappedValue !== null) {
      vm.setProp(vmObject, key, wrappedValue);
      if (wrappedValue != vm.undefined && wrappedValue != vm.null && wrappedValue.dispose) {
        wrappedValue.dispose();
      }
    }
  });
  return vmObject;
}
function wrapArray(vm, arr, beginAsyncProcess, endAsyncProcess) {
  const vmArray = vm.newArray();
  for (let i = 0; i < arr.length; i++) {
    let wrappedValue = wrap(vm, arr[i], arr, beginAsyncProcess, endAsyncProcess);
    vm.setProp(vmArray, i, wrappedValue);
    if (wrappedValue != vm.undefined && wrappedValue != vm.null) {
      wrappedValue.dispose();
    }
  }
  return vmArray;
}
function wrapGenericFunction(vm, fn, context = void 0, beginAsyncProcess, endAsyncProcess) {
  const vmFn = vm.newFunction(fn.name, (...args) => {
    const unwrappedArgs = args.map(vm.dump);
    try {
      const result = fn.call(context, ...unwrappedArgs);
      const wrappedResult = wrap(vm, result, void 0, beginAsyncProcess, endAsyncProcess);
      return wrappedResult;
    } catch (e) {
      console.log("Error", e);
    }
  });
  return vmFn;
}
function injectTimingFunctions(vm, cbAddedTimer, cbRemovedTimer, maxTimeout = 6e5) {
  const timeoutFunctionHandles = {};
  const _setTimeout = vm.newFunction("setTimeout", (vmFnHandle, timeoutHandle) => {
    const vmFnHandleCopy = vmFnHandle.dup();
    let timeout = vm.dump(timeoutHandle);
    if (timeout > maxTimeout) {
      timeout = maxTimeout;
    }
    cbAddedTimer();
    const timeoutID = setTimeout(() => {
      timeoutFunctionHandles[timeoutID.toString()] = null;
      cbRemovedTimer();
      vm.callFunction(vmFnHandleCopy, vm.undefined);
      vmFnHandleCopy.dispose();
      vm.runtime.executePendingJobs();
    }, timeout);
    timeoutFunctionHandles[timeoutID.toString()] = vmFnHandleCopy;
    return vm.newNumber(timeoutID);
  });
  vm.setProp(vm.global, "setTimeout", _setTimeout);
  _setTimeout.dispose();
  const intervalFunctionHandles = {};
  const _setInterval = vm.newFunction("setInterval", (vmFnHandle, timeoutHandle) => {
    const vmFnHandleCopy = vmFnHandle.dup();
    let timeout = vm.dump(timeoutHandle);
    if (timeout > maxTimeout) {
      timeout = maxTimeout;
    }
    const maxRepetitions = 99;
    let repetitions = 0;
    cbAddedTimer();
    const intervalId = setInterval(() => {
      repetitions += 1;
      intervalFunctionHandles[intervalId.toString()] = null;
      vm.callFunction(vmFnHandleCopy, vm.undefined);
      vm.runtime.executePendingJobs();
      if (repetitions > maxRepetitions) {
        console.log("Sandbox interval exceeded max repetitions");
        clearInterval(intervalId);
        cbRemovedTimer();
        return;
      }
    }, timeout);
    intervalFunctionHandles[intervalId.toString()] = vmFnHandleCopy;
    return vm.newNumber(intervalId);
  });
  vm.setProp(vm.global, "setInterval", _setInterval);
  _setInterval.dispose();
  const _clearTimeout = vm.newFunction("clearTimeout", (timeoutIdHandle) => {
    const timeoutId = vm.dump(timeoutIdHandle);
    const timeoutHandle = timeoutFunctionHandles[timeoutId.toString()];
    if (timeoutHandle) {
      cbRemovedTimer();
      timeoutHandle.dispose();
      clearTimeout(timeoutId);
    }
  });
  vm.setProp(vm.global, "clearTimeout", _clearTimeout);
  _clearTimeout.dispose();
  const _clearInterval = vm.newFunction("clearInterval", (intervalIdHandle) => {
    const intervalId = vm.dump(intervalIdHandle);
    const intervalHandle = intervalFunctionHandles[intervalId.toString()];
    if (intervalId) {
      cbRemovedTimer();
      intervalHandle.dispose();
      clearInterval(intervalId);
    }
  });
  vm.setProp(vm.global, "clearInterval", _clearInterval);
  _clearInterval.dispose();
}

function tsCompile(source, options = null) {
  if (null === options) {
    options = {
      compilerOptions: {
        target: ts__namespace.ScriptTarget.ES2020,
        module: ts__namespace.ModuleKind.None
      }
    };
  }
  return ts__namespace.transpileModule(source, options).outputText;
}
async function createSandbox(QuickJS, requireLookup = {}, globals = {}, debug = false) {
  const vm = QuickJS.newContext();
  let errorState = false;
  let lastError = "";
  let asyncProcessesRunning = 0;
  let beginAsyncProcess = () => {
    asyncProcessesRunning++;
  };
  let endAsyncProcess = () => {
    if (asyncProcessesRunning > 0) {
      asyncProcessesRunning--;
    }
  };
  let isAsyncProcessRunning = () => {
    return asyncProcessesRunning > 0;
  };
  const logHandle = vm.newFunction("log", (...args) => {
    const nativeArgs = args.map(vm.dump);
    console.log("QuickJS Log:", ...nativeArgs);
  });
  const consoleHandle = vm.newObject();
  const exportsHandle = vm.newObject();
  const errorHandle = vm.newFunction("error", (...args) => {
    try {
      const nativeArgs = args.map(vm.dump);
      console.log("QuickJS console.error:", ...nativeArgs);
      lastError = JSON.stringify(nativeArgs);
      errorState = true;
    } catch (e) {
      console.log("Error in error:", e);
    }
  });
  const globalNames = Object.getOwnPropertyNames(globals);
  for (let i = 0; i < globalNames.length; i++) {
    const globalOption = globals[globalNames[i]];
    const globalObj = globalOption.whitelist ? wrapObjectWhitelist(
      vm,
      globalOption.value,
      globalOption.whitelist,
      beginAsyncProcess,
      endAsyncProcess
    ) : wrap(vm, globalOption.value, globalOption, beginAsyncProcess, endAsyncProcess);
    vm.setProp(vm.global, globalNames[i], globalObj);
    globalObj.dispose();
  }
  injectTimingFunctions(vm, beginAsyncProcess, endAsyncProcess);
  const requireHandle = vm.newFunction("require", (...args) => {
    const nativeArgs = args.map(vm.dump);
    if (requireLookup[nativeArgs[0]]) {
      const returnObj = wrapObject(vm, requireLookup[nativeArgs[0]], beginAsyncProcess, endAsyncProcess);
      return returnObj;
    } else {
      return vm.undefined;
    }
  });
  vm.setProp(consoleHandle, "log", logHandle);
  vm.setProp(consoleHandle, "error", errorHandle);
  vm.setProp(vm.global, "require", requireHandle);
  vm.setProp(vm.global, "console", consoleHandle);
  vm.setProp(vm.global, "exports", exportsHandle);
  consoleHandle.dispose();
  logHandle.dispose();
  exportsHandle.dispose();
  errorHandle.dispose();
  requireHandle.dispose();
  return {
    vm,
    getLastError: () => {
      return lastError;
    },
    isAsyncProcessRunning,
    runTask: (task) => {
      try {
        const compiled = tsCompile(task);
        if (!compiled || compiled.length === 0) {
          console.error("Could not compile", task);
          return false;
        }
        errorState = false;
        const result = vm.evalCode(compiled);
        if (result.error) {
          const lines = compiled.split("\n");
          for (let i = 0; i < lines.length; i++) {
            console.log(`${i + 1}: ${lines[i]}`);
          }
          console.log("Execution failed:", vm.dump(result.error));
          result.error.dispose();
          return false;
        } else {
          result.value.dispose();
          if (errorState) {
            const lines = compiled.split("\n");
            for (let i = 0; i < lines.length; i++) {
              console.log(`${i + 1}: ${lines[i]}`);
            }
          }
          return !errorState;
        }
      } catch (e) {
        console.log(e);
      }
      return false;
    }
  };
}

require$1("dotenv").config();
const openai = new openai$1.OpenAI({
  apiKey: process.env.OPENAI_API_KEY
  // This is also the default, can be omitted
});
function createBasePrompt(apiFilePath, documentationPath) {
  const apiText = fs.readFileSync(apiFilePath, "utf8");
  const documentationText = documentationPath ? fs.readFileSync(documentationPath, "utf8") : "";
  const createTaskPrompt = fs.readFileSync(path.join(__dirname, "../prompts/create-task-prompt.md"), "utf8").replace("{{DOCUMENTATION}}", documentationText).replace("{{API}}", apiText);
  return createTaskPrompt;
}
const generateCode = async function(queryText, userChatHistory, createTaskPrompt, apiPath, debug = false, model = "gpt-4o") {
  if (!queryText)
    return { code: "", loggableCode: "" };
  let generatedCode = "";
  const prompt = createTaskPrompt.replace("{{QUERY_TEXT}}", queryText);
  const messages = [
    {
      role: "system",
      content: prompt
    },
    ...userChatHistory,
    {
      role: "user",
      content: `${queryText}.
Respond only with code enclosed in \`\`\`.`,
      name: "user"
    }
  ];
  try {
    const results = await openai.chat.completions.create(
      {
        model,
        messages,
        temperature: 0,
        max_tokens: 700
      }
    );
    if (debug)
      console.log(results.usage);
    const response = results.choices[0].message.content;
    if (debug)
      console.log(response);
    const codeStart = response.indexOf("```");
    const codeEnd = response.lastIndexOf("```");
    if (codeStart === -1 || codeEnd === -1 || codeStart === codeEnd) {
      return { code: "", loggableCode: "", rawResponse: response };
    }
    generatedCode = response.substring(codeStart + 3, codeEnd).replace("typescript", "");
    const codeHeader = `import * as ApiDefs from '${apiPath}'
(async() {
	try {`;
    const codeFooter = `
	} catch(err) {
		console.error(err);
	}
})();`;
    return { code: codeHeader + generatedCode + codeFooter, loggableCode: generatedCode };
  } catch (err) {
    console.error(err);
    return { code: "", loggableCode: "" };
  }
};
let QuickJS = null;
async function createWithAPI(options) {
  options = {
    apiGlobalName: "api",
    apiGlobals: {},
    apiWhitelist: Object.getOwnPropertyNames(Object.getPrototypeOf(options.apiObject)).filter((f) => f !== "constructor" && !f.startsWith("_")),
    debug: false,
    model: "gpt-4o",
    ...options
  };
  if (!options.apiObject || !options.apiDefFilePath) {
    throw new Error("apiObject and apiFilePath are required");
  }
  const { apiObject, apiWhitelist, apiGlobalName, apiExports, apiDefFilePath, apiDocsPath, debug, model } = options;
  const createTaskPrompt = createBasePrompt(apiDefFilePath, apiDocsPath);
  return {
    options,
    generateCode: async function(queryText, userChatHistory, currentContext = void 0) {
      if (!queryText)
        return { code: "", loggableCode: "" };
      return await generateCode(queryText, userChatHistory, createTaskPrompt.replace("{{CONTEXT}}", currentContext ? "```" + JSON.stringify(currentContext, null, 2) + "```" : ""), apiDefFilePath, debug, model);
    },
    runCode: async function(generatedCode) {
      if (!QuickJS) {
        if (debug)
          console.log("Creating quick.js");
        QuickJS = await quickjsEmscripten.getQuickJS();
      }
      let apiGlobals = {};
      for (const key in options.apiGlobals) {
        apiGlobals[key] = {
          value: options.apiGlobals[key]
        };
      }
      const { vm, runTask, isAsyncProcessRunning } = await createSandbox(QuickJS, {
        [apiDefFilePath.replaceAll("\\", "")]: apiExports
      }, {
        ...apiGlobals,
        [apiGlobalName]: {
          value: apiObject,
          whitelist: apiWhitelist
        }
      }, options.debug);
      try {
        if (debug) {
          console.log("Running Code:\n", generatedCode);
        }
        const res = await runTask(generatedCode);
        if (!res) {
          console.error("Task unsuccessful");
        }
        while (isAsyncProcessRunning()) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (debug) {
          console.log("Completed");
        }
      } catch (err) {
        if (debug) {
          console.error("Error running task:", err);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      rejectOpenPromises(vm);
      vm.dispose();
    },
    processRequest: async function(userQuery, currentContext = void 0) {
      if (debug) {
        console.log("Query:", userQuery);
      }
      console.time("Generate Task");
      const generatedCode = await generateCode(userQuery, [], createTaskPrompt.replace("{{CONTEXT}}", currentContext ? "```" + JSON.stringify(currentContext, null, 2) + "```" : ""), apiDefFilePath);
      console.timeEnd("Generate Task");
      console.time("Run Code");
      await this.runCode(generatedCode.code);
      console.timeEnd("Run Code");
      return generatedCode;
    }
  };
}
const aimyapi = {
  // Standard way of using the library
  createWithAPI,
  // functions for customized usage
  createBasePrompt,
  generateCode,
  createSandbox
};

exports.aimyapi = aimyapi;
exports.createBasePrompt = createBasePrompt;
exports.generateCode = generateCode;
