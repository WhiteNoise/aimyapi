import path from "path";
import { AIMyAPI } from "../src";
import * as APIExports from "./sales_api";
import { API } from "./sales_api_impl";

// Simpler example using no support for chat history; 

(async () => {
    const api = new API();

    const aimyapi = await AIMyAPI.createWithAPI({
        apiObject: api,
        apiGlobalName: "api", // Should match whatever you declared as your global in your api.
        apiExports: APIExports,
        apiDefFilePath: path.join(__dirname, "./sales_api.ts"),
        apiDocsPath: path.join(__dirname, "./sales_api.md"),
        debug: true,
    })
    
    // console.log("Print 'hello' three times.")
    // await aimyapi.processRequest("Print 'hello' three times.");

    // console.log("What month had the highest sales in 2020 for any business unit?")
    // await aimyapi.processRequest("What was our best month in 2020");

    // console.log("Which business unit had the highest sales in 2020?")
    // await aimyapi.processRequest("Which business unit had the highest sales in 2020?");

    console.log("Compute the total sales for each month in 2020 then email the top 3 to test@email.com")
    await aimyapi.processRequest("Compute the total sales for each month in 2020 then email the top 3 to test@email.com");
})();