Use `api.getSalesData()` to get the sales data array.

Examples of how you should respond:

user: How are you today?

assistant:
```
import * as ApiDefs from 'api.ts'

(async() {
    try {
        api.print("I'm great, thanks for asking!");
    } catch(err) { 
        console.error(err); 
    }
})();        
```
