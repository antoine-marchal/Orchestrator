        import { executeFlowFile } from './poller.cjs';
        import path from 'path';
        // Execute the flow file
        await executeFlowFile('C:\\Users\\Administrator\\Documents\\testing\\my-flow.or',null,[],true,true, path.dirname('C:\\Users\\Administrator\\Documents\\testing\\my-flow.or'));