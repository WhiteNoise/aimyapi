require('dotenv').config()
import fs from 'fs';
import { OpenAI } from "openai";
import path from 'path';

import createSandbox from "./sandbox";
import { rejectOpenPromises } from './sandbox-wrappers';

import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import { QuickJSWASMModule, getQuickJS } from "quickjs-emscripten";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY // This is also the default, can be omitted
  });


// function formatObject(obj: any): string {
//     return Object.keys(obj).reduce((acc, key) => {
//       return `${acc}${key}:\n${obj[key]}\n\n`;
//     }, "");
// }

export function createBasePrompt(apiFilePath:string, documentationPath: string): string {
    const apiText: string = fs.readFileSync(apiFilePath, 'utf8');
    const documentationText: string = documentationPath ? fs.readFileSync(documentationPath, 'utf8') : '';

    //console.time("Loading templates");
    const createTaskPrompt: string = fs.readFileSync( path.join(__dirname, '../prompts/create-task-prompt.md'), 'utf8').replace("{{DOCUMENTATION}}", documentationText).replace("{{API}}", apiText);   
    //console.timeEnd("Loading templates")
    
    return createTaskPrompt;
}

export interface GenerateCodeResult {
    code: string;
    loggableCode: string;
    rawResponse?: string;
}

// FIXME: add an options parameter and allow specifying the token limit
export const generateCode = async function(queryText:string, userChatHistory:ChatCompletionMessageParam[], createTaskPrompt:string, apiPath:string, debug:boolean = false, model="gpt-4o"): Promise<GenerateCodeResult> {
    if(!queryText)
        return { code: '', loggableCode: '' };

    let generatedCode = '';
    const prompt = createTaskPrompt.replace("{{QUERY_TEXT}}", queryText);
    const messages:ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: prompt,
        },
        ...userChatHistory,
        {
            role: "user",
            content: `${queryText}.\nRespond only with code enclosed in \`\`\`.`,
            name: "user"
        }
    ];
    try {
        const results = await openai.chat.completions.create({
            model,
            messages: messages,
            temperature: 0.0,
            max_tokens: 700,
            }
        );

        if(debug)
            console.log(results.usage);
        
        const response = results.choices[0].message.content;

        if(debug)
            console.log(response);
            
        // Return only the code between ``` and ``` (usually at the end of the completion)
        const codeStart = response.indexOf('```');
        const codeEnd = response.lastIndexOf('```');

        // error, no code detected inside the response
        if(codeStart === -1 || codeEnd === -1 || codeStart === codeEnd) {
            return { code: '', loggableCode: '', rawResponse: response };
        }

        generatedCode = response.substring(codeStart + 3, codeEnd).replace('typescript', '');
       
        const codeHeader = `import * as ApiDefs from '${apiPath}'\n(async() {\n\ttry {`;
        const codeFooter = `\n\t} catch(err) {\n\t\tconsole.error(err);\n\t}\n})();`;
        return { code: codeHeader + generatedCode + codeFooter, loggableCode: generatedCode };
    } catch(err) {
        console.error(err);
        return { code: '', loggableCode: '' };
    } 
};

let QuickJS:QuickJSWASMModule = null;

export interface AIMyAPIOptions {
    apiObject: object;
    apiExports: object;
    apiWhitelist?: string[];      // List of functions to expose to the user. Necessary to pass this yourself if you are extending your api from another class.
    apiGlobals?: object;
    apiDefFilePath: string;     // Full path to the api definition file so that it can be loaded into the prompt
    apiGlobalName?: string;    
    apiDocsPath?: string;
    debug?: boolean;
    model?: string;
};

export interface AIMyAPIInstance {
    // see xample 2
    options:AIMyAPIOptions;
    generateCode: (queryText:string, userChatHistory:ChatCompletionMessageParam[]) => Promise<GenerateCodeResult>;
    runCode: (task:string) => Promise<void>;
    // run a single request with no history
    processRequest: (userQuery:string, context?: object) => Promise<GenerateCodeResult>;
    
}

async function createWithAPI(options:AIMyAPIOptions): Promise<AIMyAPIInstance> {
    // extend options with defaults
    options = {
        apiGlobalName: "api",
        apiGlobals: {},
        apiWhitelist: Object.getOwnPropertyNames(Object.getPrototypeOf(options.apiObject)).filter((f) => f !== "constructor" && !f.startsWith("_")),
        debug: false, 
        model: "gpt-4o",
        ...options
    } as AIMyAPIOptions;

    if(!options.apiObject || !options.apiDefFilePath) {
        throw new Error("apiObject and apiFilePath are required");
    }

    const {apiObject, apiWhitelist, apiGlobalName, apiExports, apiDefFilePath, apiDocsPath, debug, model} = options;

    const createTaskPrompt = createBasePrompt( apiDefFilePath, apiDocsPath);

    return {
        options,
        generateCode: async function(queryText:string, userChatHistory:ChatCompletionMessageParam[], currentContext:any = undefined) {
            if(!queryText)
                return { code: '', loggableCode: '' };

            return await generateCode(queryText, userChatHistory, createTaskPrompt.replace("{{CONTEXT}}", currentContext ? "```" + JSON.stringify(currentContext, null, 2) + "```" : ""), apiDefFilePath, debug, model);
        },
        runCode: async function(generatedCode:string) {
            if(!QuickJS) {
                // Create QuickJS
                if(debug)
                    console.log("Creating quick.js");
                QuickJS = await getQuickJS();
            }

            let apiGlobals = {}

            for(const key in options.apiGlobals) {
                apiGlobals[key] = {
                    value: options.apiGlobals[key],
                }
            }
      
            // Create sandbox           
            // NOTE: not sure why I have to replace the backslash here
            const {vm, runTask, isAsyncProcessRunning} = await createSandbox(QuickJS, {
                [apiDefFilePath.replaceAll("\\", "")]: apiExports,
            }, { 
                ...apiGlobals,
                [apiGlobalName]: {
                    value: apiObject,
                    whitelist: apiWhitelist
                }
            }, options.debug);

            try {
                if(debug) {
                    console.log("Running Code:\n", generatedCode);
                }

                const res = await runTask(generatedCode);
        
                if(!res) {
                    console.error("Task unsuccessful");
                } 
        
                while(isAsyncProcessRunning()) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            
                if(debug) {
                    console.log("Completed");
                }
            } catch(err) {
                if(debug) {
                    console.error("Error running task:", err);
                }
            }
        
            await new Promise((resolve) => setTimeout(resolve, 100));
        
            rejectOpenPromises(vm);
            vm.dispose()             
        
        }, 
        processRequest: async function (userQuery, currentContext:any = undefined):Promise<GenerateCodeResult> {
            // Create prompt
            
            if(debug) {
                console.log("Query:", userQuery);
            }
        
            // Generate Code
            console.time("Generate Task")
            const generatedCode:GenerateCodeResult = await generateCode(userQuery, [], createTaskPrompt.replace("{{CONTEXT}}", currentContext ? "```" + JSON.stringify(currentContext, null, 2) + "```" : "" ), apiDefFilePath);
            console.timeEnd("Generate Task")
        
            console.time("Run Code")
            await this.runCode(generatedCode.code);
            console.timeEnd("Run Code")

            return generatedCode;
        }
    }

}

export interface AIMyAPIModuleExports {
    createWithAPI: (options:AIMyAPIOptions) => Promise<AIMyAPIInstance>;
    
    createBasePrompt: (apiFilePath:string, documentationPath: string) => string;
    generateCode: (queryText:string, userChatHistory:ChatCompletionMessageParam[], createTaskPrompt:string, apiPath:string, debug:boolean) => Promise<GenerateCodeResult>;
    createSandbox: (QuickJS:QuickJSWASMModule, globals: any) => Promise<any>;
}

export const AIMyAPI:AIMyAPIModuleExports = {
    // Standard way of using the library
    createWithAPI,      

    // functions for customized usage
    createBasePrompt,   
    generateCode,
    createSandbox,
}
