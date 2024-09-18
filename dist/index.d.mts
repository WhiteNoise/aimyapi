import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import { QuickJSWASMModule } from 'quickjs-emscripten';

declare function createBasePrompt(apiFilePath: string, documentationPath: string): string;
interface GenerateCodeResult {
    code: string;
    loggableCode: string;
    rawResponse?: string;
}
declare const generateCode: (queryText: string, userChatHistory: ChatCompletionMessageParam[], createTaskPrompt: string, apiPath: string, debug?: boolean, model?: string) => Promise<GenerateCodeResult>;
interface AIMyAPIOptions {
    apiObject: object;
    apiExports: object;
    apiWhitelist?: string[];
    apiGlobals?: object;
    apiDefFilePath: string;
    apiGlobalName?: string;
    apiDocsPath?: string;
    debug?: boolean;
    model?: string;
}
interface AIMyAPIInstance {
    options: AIMyAPIOptions;
    generateCode: (queryText: string, userChatHistory: ChatCompletionMessageParam[]) => Promise<GenerateCodeResult>;
    runCode: (task: string) => Promise<void>;
    processRequest: (userQuery: string, context?: object) => Promise<GenerateCodeResult>;
}
interface AIMyAPIModuleExports {
    createWithAPI: (options: AIMyAPIOptions) => Promise<AIMyAPIInstance>;
    createBasePrompt: (apiFilePath: string, documentationPath: string) => string;
    generateCode: (queryText: string, userChatHistory: ChatCompletionMessageParam[], createTaskPrompt: string, apiPath: string, debug: boolean) => Promise<GenerateCodeResult>;
    createSandbox: (QuickJS: QuickJSWASMModule, globals: any) => Promise<any>;
}
declare const AIMyAPI: AIMyAPIModuleExports;

export { AIMyAPI, type AIMyAPIInstance, type AIMyAPIModuleExports, type AIMyAPIOptions, type GenerateCodeResult, createBasePrompt, generateCode };
