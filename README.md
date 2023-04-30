# AI My API

Note: Still working on making this available as a library.

Build AI assistants that use your API's and respond to natural language queries by writing small programs that are executed in a [QuickJS](https://github.com/justjake/quickjs-emscripten) sandbox.
AIMyAPI writes the glue between your various API functions unlocking new functionality without having to write any code. With the right building blocks, AIMyAPI can even invent new functionality you didn't originally plan for - 
for example, being able to sort or filter your data in new ways, email or text yourself results, or combine the results of different operations and API's.

## Quickstart
Simply define your strongly-typed typescript API:

`sales_api.ts`
```
// Sales data for each month, per business unit
export interface SalesData {
    sales: number;
    month: number;  // 1...12
    year: number;
    businessUnit: "Advertising" | "Hardware" | "Software";
}

export interface APIInterface {
    sendEmail(to: string, subject: string, body: string): Promise<void>;

    getSalesData(): SalesData[];
    // Returns an array of sales data.

    print(text: string): void;
    // Prints the specified text to the user.

    delay(milliseconds: number): Promise<void>;
    // waits for the specified number of milliseconds before resolving the promise.
};

// Global object you will use for accessing the APIInterface
declare global {
    var api: APIInterface;
}

```

Implement it:
```
export class API implements APIInterface {

    sendEmail(to: string, subject: string, body: string): Promise<void> {
    ...
```

Instantiate your api and AIMyAPI. AIMyAPI will wrap your API so that it can be called from within the QuickJS sandbox.

```
const api = new API();

const aimyapi = await AIMyAPI.createWithAPI({
    apiObject: api,
    apiExports: APIExports,
    apiDefFilePath: path.join(__dirname, "./sales_api.ts"),
    apiDocsPath: path.join(__dirname, "./sales_api.md"),
})
```

And now you can make requests against the API in natural language.
Any code generated by the LLM will be run within the sandbox. The LLM will ONLY have access to functions provided within your API and cannot use javascript to make http requests etc.

```
await aimyapi.processRequest("Which business unit had the highest sales in 2020?");
```

This would produce the following code generated by the LLM prompt, which is run in the sandbox and makes calls on your API object:

```
import * as ApiDefs from './api.ts'
(async() => {
    try {
        let salesData = api.getSalesData();
        let maxSales = 0;
        let businessUnitWithMaxSales = "";
        for (let i = 0; i < salesData.length; i++) {
            if (salesData[i].year === 2020 && salesData[i].sales > maxSales) {
                maxSales = salesData[i].sales;
                businessUnitWithMaxSales = salesData[i].businessUnit;
            }
        }
        api.print(\`The business unit with the highest sales in 2020 was ${businessUnitWithMaxSales}.\`);
    } catch(e) {
        console.error(e);
    }
})();
```

This example does not take advantage of the chat history and treats every request as a fresh chat. See `example2` for a more complex example that uses the chat history.

APIs should be kept simple and understandable. If you have a complicated API you may want to write a facade for it.

## Advantages and disadvantages of generating code

Currently there is a lot of hype around "agents" - while agents are extremely cool they have a couple drawbacks vs. the code generation approach that AIMyAPI uses to do some of the same things.

**Advantages of AIMyAPI over the Agent (haystack) approach:**

- Open AI's LLMs today are already really good at writing code, but not necessarily trained on the 'haystack' approach.
- Data from your API can be kept private as long as you don't add it to the chat history or the prompt. The LLM is writing the operations to manipulate the data but doesn't need to see the data itself to do that.
- Writing code means that AIMyAPI can do math and algorithms out of the box - something LLMs by themselves struggle at. For instance, asking it to do a simple calculation will result in it writing code to do the calculation. Agents can do this using 'tools', but that means you need to do the work to implement and explain these tools wheras they come built-in in a programming language.
- Agents typically only do one thing at a time and require several OpenAI API calls to do a single loop. AIMyAPI can write an entire program that does several things in one shot.


**Disadvantages:**

- This is not an iterative approach: AIMyAPI must have a full understanding of the problem and the API in order write code against it. 
- It is not currently set up to be able to troubleshoot or fix it's own code (this may be possible)
- Limits on the context for OpenAI's LLMs mean you can't have a super big API (maybe GPT4 will make this a non-issue). 

## installation

```
npm install
```

create a .env file in the root of your project
add your open ai key:
```
OPENAI_API_KEY=XXXXXXXX
```

## Examples

A simple api example where the LLM allows you to ask questions and compute things about a dataset
```
npm run example1
```

A more complex ordering example which incorporates chat history

```
npm run example2
```

## Providing examples

Providing examples is super important.
We recommend that you instruct the LLM to return a self executing async function enclosed in \`\`\` with no other commentary. See the `example/ordering_api.md` for reference.
It's recommended that you provide at least one example and no other commentary from the assistant, otherwise the LLM's responses will vary pretty widely and probably be unusable.

**Sample example**:

```
Examples of how you should respond:

user: How are you today?

assistant:
\`\`\`
import * as ApiDefs from './api.ts'
(async() {
    try {
        api.print("I'm great, thanks for asking!");
    } catch(e) {
        console.error(e);
    }
})();
\`\`\`
```

Aside from the code generation piece, documenting your API with clearly named functions and comments is important so that the LLM understands how it can be used. A big part of using AIMyAPI is testing out usecases and looking at the code that is generated. Problems can be solved by how you name your api, comments in the api, and examples.

## A note about history

If you plan to use history, it is vital that you include the generated code in the history. Otherwise, the LLM will start to think that it doesn't need to generate code.

In example2, note that responses to the user and relevant information is also added to the history so that the LLM can reference it for future queries.

## Safety notes:

- If the user is giving sensitive information in a query, that information isn't private. Refer to the OpenAI policies and plan accordingly.
- The LLM will do stupid things with your API. You should idiot proof your functions, make sure you sanity check any inputs, etc.
- Even though we are running the code in sandbox, you should still treat anything coming back from the LLM as untrusted code.
- You should never give the LLM access to anything mission critical through your API such as live production data or services. 
- Give as few permissions as is necessary - read only access would be preferred. 
- Users can trick the LLM to do things that you may not want or intend. Again, access controls are critical. You shouldn't let users access anything they wouldn't normally be able to access via your API.
- Any 'dangerous' operations should involve some kind of human oversight and approval.
- A way to audit and rollback anything the LLM does would be wise. The LLM can misunderstand requests due to false assumptions or incomplete information (or trickery). If you allow it to modify your data it could mess things up.
- By using this library you acknowledge that you take full responsibility for anything that happens as a result of it's use. We cannot gaurantee what will happen based on your instructions to the LLM or how the LLM interprets them etc.

## Thoughts:

Could fine tuning on our API and examples allow us to make the prompt smaller? We can only fine tune on the base models though, so we can't use the cheaper gpt3.5-turbo model.
Could a smaller / more efficient LLM focused on coding tasks work for this usecase?

## TODO

Build process so that this can be used as a module
Interactive ordering example
