        import { executeFlowFile } from './poller.cjs';
        import path from 'path';
        // Execute the flow file
        await executeFlowFile('testing/my-flow.or',null,[],true,true, path.dirname('testing/my-flow.or'));