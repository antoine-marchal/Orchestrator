# Flow Nodes Documentation

## What are Flow Nodes?

Flow nodes are a powerful feature in the Orchestrator application that allow you to create reusable, modular workflows by referencing external flow files. A flow node acts as a container that executes another flow file, enabling hierarchical workflow composition and code reuse.

Flow nodes serve as building blocks for complex workflows, allowing you to:

- Break down complex processes into manageable, reusable components
- Create modular workflows that can be nested within other workflows
- Organize related functionality into separate flow files
- Reuse common workflow patterns across multiple projects
- Maintain cleaner, more maintainable workflow designs

## How to Create and Edit Flow Nodes

### Creating a Flow Node

1. In the Flow Editor, click the **Add Node** button in the toolbar or right-click in the editor canvas
2. Select **Flow** from the dropdown menu
3. A file selection dialog will appear, allowing you to choose an existing flow file (`.or` file)
4. Once selected, a new flow node will be created with the filename as its label

### Editing a Flow Node

To change the referenced flow file:

1. Double-click on the flow node in the editor
2. A file selection dialog will appear
3. Choose a different flow file to be referenced by this node
4. The node label will update to reflect the new filename

When you create or double-click a flow node, the referenced flow file will automatically open in a new Orchestrator window. This allows you to:

- View and edit the referenced flow while keeping the parent flow open
- Make changes to the referenced flow and test them immediately
- Navigate between multiple levels of nested flows with separate windows for each

### Visual Identification

Flow nodes have a distinct appearance to help you identify them in your workflows:

- Flow nodes have a green background color (compared to the standard gray for other nodes)
- When selected, flow nodes display a green highlight ring
- In the minimap, flow nodes are represented with a green color
- Flow nodes are identified by the GitBranch icon (emerald/green) in the node header

#### Node Type Icons

Each node type in Orchestrator has a unique icon to help you quickly identify its purpose:

- **Flow**: GitBranch icon (emerald/green) - Represents a reference to another flow file
- **JavaScript**: FileCode icon (yellow) - For client-side JavaScript code
- **Backend JS**: Server icon (blue) - For server-side JavaScript code
- **Groovy**: Coffee icon (red) - For Groovy script execution
- **Batch**: Terminal icon (gray) - For Windows batch script execution
- **PowerShell**: TerminalSquare icon (blue) - For PowerShell script execution
- **Constant**: Hash icon (purple) - For constant value nodes
- **Comment**: MessageSquare icon (gray) - For documentation and notes

## How Flow Nodes Execute and Process Data

Flow nodes operate by executing the entire workflow contained in the referenced flow file. The execution process follows these steps:

1. **Input Processing**: The flow node receives input data from its connected input nodes
2. **Flow File Loading**: The system loads the referenced flow file and parses its nodes and edges
3. **Dependency Resolution**: The system analyzes the flow to determine the execution order based on node dependencies
4. **Sequential Execution**: Each node in the referenced flow is executed in the correct order, with data flowing between nodes as defined by the edges
5. **Result Collection**: The output from the last node (end node) in the referenced flow becomes the output of the flow node itself
6. **Output Passing**: This output is then passed to any nodes connected to the flow node's output

### Data Flow

- **Input**: A flow node can receive input from one or more connected nodes. If multiple inputs are connected, they are passed as an array to the referenced flow.
- **Processing**: The input data is passed to the first node(s) in the referenced flow file.
- **Output**: The output from the last node (with no outgoing connections) in the referenced flow becomes the output of the flow node.

### Execution Context

Flow nodes maintain their own execution context, meaning:

- Variables and data defined within a flow node are isolated to that flow's execution
- The parent flow only receives the final output, not intermediate results
- Each flow node execution is treated as a single operation from the perspective of the parent flow

## Best Practices for Using Flow Nodes

### Workflow Organization

- **Single Responsibility**: Design each flow file to perform a specific, well-defined task
- **Meaningful Names**: Use descriptive filenames for your flow files to clearly indicate their purpose
- **Hierarchical Structure**: Create a logical hierarchy of flows, with higher-level flows orchestrating more specialized sub-flows
- **Consistent Inputs/Outputs**: Maintain consistent input and output formats for flow nodes to ensure compatibility

### Performance Considerations

- **Complexity Management**: Break complex workflows into smaller, manageable flow files
- **Reuse Common Patterns**: Create flow files for frequently used operations to avoid duplication
- **Depth Control**: Avoid excessive nesting of flow nodes (more than 3-4 levels deep) to maintain performance
- **Error Handling**: Include error handling in your flows to prevent failures from propagating

### Maintenance Tips

- **Documentation**: Add comment nodes to document the purpose and expected inputs/outputs of your flows
- **Version Control**: Store flow files in version control systems to track changes
- **Testing**: Create test flows that validate the behavior of your reusable flow components
- **Modular Design**: Design flows to be modular and composable, with clear interfaces between components

## Examples of Use Cases for Flow Nodes

### Data Processing Pipelines

Create reusable data transformation pipelines that can be incorporated into multiple workflows:

- Data cleaning and normalization flows
- Format conversion flows (JSON to CSV, XML to JSON, etc.)
- Data enrichment flows that add additional information to records

### Business Process Automation

Model complex business processes as composable flows:

- Customer onboarding processes
- Order processing workflows
- Approval workflows with multiple stages

### Integration Scenarios

Build reusable integration patterns:

- API request/response handling
- Authentication flows
- Error handling and retry logic

### Example: Multi-stage Data Processing

1. **Main Flow**: Orchestrates the overall process
   - Reads input data
   - Passes data to a "Data Validation" flow node
   - Routes validated data to a "Data Transformation" flow node
   - Sends transformed data to a "Data Export" flow node

2. **Data Validation Flow**: Contained in its own flow file
   - Checks data format
   - Validates required fields
   - Filters out invalid records
   - Returns only valid data

3. **Data Transformation Flow**: Contained in its own flow file
   - Applies business rules to transform data
   - Enriches data with additional information
   - Formats data according to requirements
   - Returns transformed data

4. **Data Export Flow**: Contained in its own flow file
   - Formats data for export
   - Writes data to destination
   - Generates success/failure report
   - Returns export status

This modular approach allows each component to be developed, tested, and maintained independently, while also enabling reuse across different workflows.

## Command Line Execution

Orchestrator supports executing flows directly from the command line without opening the UI. This is useful for:

- Running flows as part of automated scripts or scheduled tasks
- Executing flows in headless environments (servers, CI/CD pipelines)
- Integrating Orchestrator flows with other applications

### Using Silent Mode

To execute a flow from the command line:

```
orchestrator.exe -s path/to/flow.or
```

or

```
orchestrator.exe --silent path/to/flow.or
```

In silent mode:
1. Orchestrator starts the backend services
2. Executes the specified flow file
3. Outputs results to the console
4. Exits automatically when execution is complete

This allows you to incorporate Orchestrator flows into batch files, shell scripts, or other automation tools without requiring user interaction.

## Conclusion

Flow nodes are a powerful feature that enables modular, reusable workflow design in the Orchestrator application. By breaking complex processes into manageable, reusable components, you can create more maintainable, flexible, and robust workflows. The ability to nest flows within other flows provides a powerful mechanism for building sophisticated automation solutions while keeping individual components simple and focused.