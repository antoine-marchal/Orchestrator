const fs = require("fs");
const path = require("path");

/**
 * Airflow DAG Generator for Orchestrator Flow Files
 * 
 * This module converts .or flow files to Apache Airflow DAG Python scripts.
 * It can be used both as a command-line tool and as a library.
 */

// Constants
const DEFAULT_AIRFLOW_ARGS = {
  owner: 'orchestrator',
  depends_on_past: false,
  email_on_failure: false,
  email_on_retry: false,
  retries: 1,
  retry_delay: 'timedelta(minutes=5)',
};

/**
 * Parse a flow file and prepare it for conversion
 * @param {string} flowFilePath - Path to the flow file
 * @returns {Object} Parsed flow with node maps and dependency information
 */
function parseFlowFile(flowFilePath) {
  // Check if the flow file exists
  if (!fs.existsSync(flowFilePath)) {
    throw new Error(`Flow file not found: ${flowFilePath}`);
  }

  // Read and parse the flow file
  const flowContent = fs.readFileSync(flowFilePath, 'utf8');
  const flow = JSON.parse(flowContent);
  
  if (!flow.nodes || !Array.isArray(flow.nodes) || !flow.edges || !Array.isArray(flow.edges)) {
    throw new Error('Invalid flow file format: missing nodes or edges array');
  }
  
  // Create a map of node IDs to nodes for easy lookup
  const nodeMap = {};
  flow.nodes.forEach(node => {
    nodeMap[node.id] = node;
  });
  
  // Create a map of dependencies (which nodes depend on which)
  const dependencies = {};
  flow.edges.forEach(edge => {
    if (!dependencies[edge.target]) {
      dependencies[edge.target] = [];
    }
    dependencies[edge.target].push(edge.source);
  });
  
  // Create a map of children (which nodes are downstream of which)
  const children = {};
  flow.edges.forEach(edge => {
    if (!children[edge.source]) {
      children[edge.source] = [];
    }
    children[edge.source].push(edge.target);
  });
  
  // Find nodes with no incoming edges (start nodes)
  const startNodes = flow.nodes.filter(node =>
    !flow.edges.some(edge => edge.target === node.id) && 
    node.type !== 'comment' // Exclude comment nodes
  );
  
  // Find nodes with no outgoing edges (end nodes)
  const endNodes = flow.nodes.filter(node =>
    !flow.edges.some(edge => edge.source === node.id) &&
    node.type !== 'comment' // Exclude comment nodes
  );
  
  if (startNodes.length === 0) {
    throw new Error('Invalid flow: no start nodes found');
  }
  
  if (endNodes.length === 0) {
    throw new Error('Invalid flow: no end nodes found');
  }

  return {
    flow,
    nodeMap,
    dependencies,
    children,
    startNodes,
    endNodes
  };
}

/**
 * Generate a valid Python identifier from a string
 * @param {string} str - Input string
 * @returns {string} Valid Python identifier
 */
function toPythonIdentifier(str) {
  if (!str) return 'task';
  
  // Replace non-alphanumeric characters with underscores
  let identifier = str.replace(/[^a-zA-Z0-9_]/g, '_');
  
  // Ensure it starts with a letter or underscore
  if (!/^[a-zA-Z_]/.test(identifier)) {
    identifier = 'task_' + identifier;
  }
  
  return identifier.toLowerCase();
}

/**
 * Extract code from a node, either from embedded code or external file
 * @param {Object} node - Node object
 * @param {string} basePath - Base path for resolving relative file paths
 * @returns {string} Extracted code
 */
function extractNodeCode(node, basePath) {
  if (!node.data) {
    return '';
  }
  
  if (node.data.code) {
    return node.data.code;
  }
  
  if (node.data.codeFilePath) {
    let codePath = node.data.codeFilePath;
    
    // Resolve relative paths
    if (!path.isAbsolute(codePath) && basePath) {
      codePath = path.resolve(basePath, codePath);
    }
    
    if (fs.existsSync(codePath)) {
      return fs.readFileSync(codePath, 'utf8');
    } else {
      console.warn(`Code file not found: ${codePath}`);
      return '';
    }
  }
  
  return '';
}

/**
 * Convert JS code to Python code for use in PythonOperator
 * This is a simple conversion and may need manual adjustment
 * @param {string} jsCode - JavaScript code
 * @returns {string} Python equivalent code (best effort)
 */
function convertJsToPython(jsCode) {
  // This is a very basic conversion - in a real implementation,
  // you might want to use a proper JS-to-Python transpiler
  // or encourage users to provide Python equivalents
  
  let pyCode = jsCode
    // Convert console.log to print
    .replace(/console\.log\(/g, 'print(')
    // Convert function declarations
    .replace(/function\s+(\w+)\s*\((.*?)\)\s*{/g, 'def $1($2):')
    // Convert arrow functions (simple cases)
    .replace(/\((.*?)\)\s*=>\s*{/g, 'lambda $1:')
    // Convert let/const/var to Python variables
    .replace(/(?:let|const|var)\s+(\w+)\s*=/g, '$1 =')
    // Convert if statements
    .replace(/if\s*\((.*?)\)\s*{/g, 'if $1:')
    // Convert else if
    .replace(/}\s*else\s*if\s*\((.*?)\)\s*{/g, 'elif $1:')
    // Convert else
    .replace(/}\s*else\s*{/g, 'else:')
    // Convert for loops (simple cases)
    .replace(/for\s*\(let\s+(\w+)\s*=\s*(\d+);\s*\1\s*<\s*(\w+);\s*\1\+\+\)\s*{/g, 'for $1 in range($2, $3):');
  
  // Add a note about the conversion
  pyCode = '# Converted from JavaScript - may need manual adjustments\n' + pyCode;
  
  return pyCode;
}

/**
 * Generate Airflow operator code for a node
 * @param {Object} node - Node object
 * @param {string} nodeId - Node ID
 * @param {string} basePath - Base path for resolving relative file paths
 * @returns {string} Airflow operator code
 */
function generateOperatorForNode(node, nodeId, basePath) {
  if (!node || !node.data) {
    return `# Empty node ${nodeId}\n${toPythonIdentifier(nodeId)} = DummyOperator(task_id='${nodeId}')\n`;
  }
  
  const taskId = nodeId;
  const taskName = toPythonIdentifier(node.data.label || nodeId);
  
  switch (node.data.type) {
    case 'constant': {
      // For constant nodes, use a PythonOperator that returns the constant value
      const value = JSON.stringify(node.data.value);
      return `
# Constant node: ${node.data.label || nodeId}
def return_constant_${taskName}(**kwargs):
    return ${value}

${taskName} = PythonOperator(
    task_id='${taskId}',
    python_callable=return_constant_${taskName},
    provide_context=True,
    do_xcom_push=True
)
`;
    }
    
    case 'js': {
      // For JS nodes, convert to PythonOperator
      const code = extractNodeCode(node, basePath);
      const pythonCode = convertJsToPython(code);
      
      return `
# JS node: ${node.data.label || nodeId}
def execute_${taskName}(**kwargs):
    # Get input from upstream tasks via XCom
    ti = kwargs['ti']
    # Assuming single upstream task for simplicity
    # In a real implementation, you'd need to handle multiple upstream tasks
    upstream_tasks = kwargs.get('upstream_task_ids', [])
    input_data = None
    if upstream_tasks:
        input_data = ti.xcom_pull(task_ids=upstream_tasks[0])
    
${pythonCode.split('\n').map(line => '    ' + line).join('\n')}
    
    # Return the result for downstream tasks
    return output

${taskName} = PythonOperator(
    task_id='${taskId}',
    python_callable=execute_${taskName},
    provide_context=True,
    op_kwargs={'upstream_task_ids': []},  # Will be populated later
    do_xcom_push=True
)
`;
    }
    
    case 'jsbackend': {
      // For jsbackend nodes, use BashOperator to run Node.js
      const code = extractNodeCode(node, basePath);
      // Escape single quotes in the code
      const escapedCode = code.replace(/'/g, "\\'");
      
      return `
# JS Backend node: ${node.data.label || nodeId}
${taskName}_code = '''
${escapedCode}
'''

# Write the code to a temporary file
${taskName}_file = '/tmp/airflow_${taskName}.js'
with open(${taskName}_file, 'w') as f:
    f.write(${taskName}_code)

${taskName} = BashOperator(
    task_id='${taskId}',
    bash_command=f'node {${taskName}_file}',
    env={
        'INPUT': "{{ ti.xcom_pull(task_ids='UPSTREAM_TASK_ID') }}"  # Will be replaced later
    },
    do_xcom_push=True
)
`;
    }
    
    case 'flow': {
      // For flow nodes, use SubDagOperator or reference another DAG
      const flowPath = node.data.codeFilePath || node.data.code || '';
      
      return `
# Flow node: ${node.data.label || nodeId}
# This references another flow file: ${flowPath}
# In a real implementation, you would either:
# 1. Create a SubDagOperator that runs a nested DAG
# 2. Create a separate DAG file and use ExternalTaskSensor

# Option 1: Using SubDagOperator
def subdag_${taskName}(parent_dag_id, child_dag_id, args):
    dag = DAG(
        dag_id=f'{parent_dag_id}.{child_dag_id}',
        default_args=args,
        schedule_interval=None,
    )
    
    # Here you would generate the tasks for the nested flow
    # For now, we'll just create a dummy task
    dummy_task = DummyOperator(
        task_id='dummy_in_subdag',
        dag=dag,
    )
    
    return dag

${taskName} = SubDagOperator(
    task_id='${taskId}',
    subdag=subdag_${taskName}(dag.dag_id, '${taskId}', default_args),
    dag=dag,
)

# Option 2: Reference to another DAG file
# ${taskName} = ExternalTaskSensor(
#     task_id='wait_for_${taskId}',
#     external_dag_id='${path.basename(flowPath, '.or')}',
#     external_task_id=None,  # Wait for the entire DAG to complete
#     dag=dag,
# )
`;
    }
    
    case 'batch': {
      // For batch nodes, use BashOperator
      const code = extractNodeCode(node, basePath);
      // Escape single quotes in the code
      const escapedCode = code.replace(/'/g, "\\'");
      
      return `
# Batch node: ${node.data.label || nodeId}
${taskName}_code = '''
${escapedCode}
'''

# Write the code to a temporary file
${taskName}_file = '/tmp/airflow_${taskName}.bat'
with open(${taskName}_file, 'w') as f:
    f.write(${taskName}_code)

${taskName} = BashOperator(
    task_id='${taskId}',
    bash_command=f'cmd /C {${taskName}_file}',
    env={
        'INPUT': "{{ ti.xcom_pull(task_ids='UPSTREAM_TASK_ID') }}"  # Will be replaced later
    },
    do_xcom_push=True
)
`;
    }
    
    case 'powershell': {
      // For PowerShell nodes, use BashOperator with powershell command
      const code = extractNodeCode(node, basePath);
      // Escape single quotes in the code
      const escapedCode = code.replace(/'/g, "\\'");
      
      return `
# PowerShell node: ${node.data.label || nodeId}
${taskName}_code = '''
${escapedCode}
'''

# Write the code to a temporary file
${taskName}_file = '/tmp/airflow_${taskName}.ps1'
with open(${taskName}_file, 'w') as f:
    f.write(${taskName}_code)

${taskName} = BashOperator(
    task_id='${taskId}',
    bash_command=f'powershell -ExecutionPolicy Bypass -File {${taskName}_file}',
    env={
        'INPUT': "{{ ti.xcom_pull(task_ids='UPSTREAM_TASK_ID') }}"  # Will be replaced later
    },
    do_xcom_push=True
)
`;
    }
    
    case 'groovy': {
      // For Groovy nodes, use BashOperator with java -jar command
      const code = extractNodeCode(node, basePath);
      // Escape single quotes in the code
      const escapedCode = code.replace(/'/g, "\\'");
      
      return `
# Groovy node: ${node.data.label || nodeId}
${taskName}_code = '''
${escapedCode}
'''

# Write the code to a temporary file
${taskName}_file = '/tmp/airflow_${taskName}.groovy'
with open(${taskName}_file, 'w') as f:
    f.write(${taskName}_code)

${taskName} = BashOperator(
    task_id='${taskId}',
    bash_command=f'java -jar /path/to/groovyExec.jar {${taskName}_file}',  # Path needs to be configured
    env={
        'INPUT': "{{ ti.xcom_pull(task_ids='UPSTREAM_TASK_ID') }}"  # Will be replaced later
    },
    do_xcom_push=True
)
`;
    }
    
    default:
      // For unknown node types, use DummyOperator
      return `
# Unknown node type (${node.data.type}): ${node.data.label || nodeId}
${taskName} = DummyOperator(
    task_id='${taskId}'
)
`;
  }
}

/**
 * Generate Airflow DAG Python code from a parsed flow
 * @param {Object} parsedFlow - Parsed flow object
 * @param {string} dagId - DAG ID
 * @param {string} basePath - Base path for resolving relative file paths
 * @returns {string} Airflow DAG Python code
 */
function generateAirflowDag(parsedFlow, dagId, basePath) {
  const { flow, nodeMap, dependencies, children } = parsedFlow;
  
  // Start with imports and DAG definition
  let code = `
# Generated by Orchestrator Airflow Converter
# Original flow file: ${dagId}

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.dummy import DummyOperator
from airflow.operators.bash import BashOperator
from airflow.operators.subdag import SubDagOperator
from airflow.sensors.external_task import ExternalTaskSensor

# Define default arguments
default_args = {
    'owner': '${DEFAULT_AIRFLOW_ARGS.owner}',
    'depends_on_past': ${DEFAULT_AIRFLOW_ARGS.depends_on_past},
    'email_on_failure': ${DEFAULT_AIRFLOW_ARGS.email_on_failure},
    'email_on_retry': ${DEFAULT_AIRFLOW_ARGS.email_on_retry},
    'retries': ${DEFAULT_AIRFLOW_ARGS.retries},
    'retry_delay': ${DEFAULT_AIRFLOW_ARGS.retry_delay},
}

# Define the DAG
dag = DAG(
    '${dagId}',
    default_args=default_args,
    description='Generated from Orchestrator flow',
    schedule_interval=None,
    start_date=datetime(2022, 1, 1),
    catchup=False,
    tags=['orchestrator', 'generated'],
)

`;

  // Generate operators for each node
  flow.nodes.forEach(node => {
    if (node.type !== 'comment') {
      code += generateOperatorForNode(node, node.id, basePath);
    }
  });
  
  // Update upstream task references for XCom pulls
  code += `
# Update upstream task references for XCom pulls
`;
  
  flow.nodes.forEach(node => {
    if (node.type !== 'comment') {
      const nodeId = node.id;
      const taskName = toPythonIdentifier(node.data?.label || nodeId);
      
      if (dependencies[nodeId] && dependencies[nodeId].length > 0) {
        const upstreamTasks = dependencies[nodeId].map(depId => {
          const depNode = nodeMap[depId];
          if (depNode && depNode.type !== 'comment') {
            return toPythonIdentifier(depNode.data?.label || depId);
          }
          return null;
        }).filter(Boolean);
        
        if (upstreamTasks.length > 0) {
          code += `
try:
    ${taskName}.op_kwargs = {'upstream_task_ids': [${upstreamTasks.map(t => `'${t}'`).join(', ')}]}
except (AttributeError, KeyError):
    pass  # Not all operators have op_kwargs

`;
          
          // For BashOperator, update the environment variables
          if (node.data && ['jsbackend', 'batch', 'powershell', 'groovy'].includes(node.data.type)) {
            code += `
try:
    # Update environment variables for BashOperator
    ${taskName}.env['INPUT'] = "{{ ti.xcom_pull(task_ids='${upstreamTasks[0]}') }}"
except (AttributeError, KeyError):
    pass  # Not a BashOperator or no upstream tasks

`;
          }
        }
      }
    }
  });
  
  // Set up task dependencies
  code += `
# Set up task dependencies
`;
  
  flow.edges.forEach(edge => {
    const sourceNode = nodeMap[edge.source];
    const targetNode = nodeMap[edge.target];
    
    if (sourceNode && targetNode && 
        sourceNode.type !== 'comment' && targetNode.type !== 'comment') {
      const sourceTaskName = toPythonIdentifier(sourceNode.data?.label || edge.source);
      const targetTaskName = toPythonIdentifier(targetNode.data?.label || edge.target);
      
      code += `${sourceTaskName} >> ${targetTaskName}\n`;
    }
  });
  
  return code;
}

/**
 * Convert a flow file to an Airflow DAG Python script
 * @param {string} flowFilePath - Path to the flow file
 * @param {string} [outputPath] - Optional path to write the output file
 * @returns {string} Generated Airflow DAG Python code
 */
function convertFlowToAirflow(flowFilePath, outputPath = null) {
  try {
    console.log(`Converting flow file: ${flowFilePath}`);
    
    // Parse the flow file
    const parsedFlow = parseFlowFile(flowFilePath);
    
    // Generate a DAG ID from the flow file name
    const dagId = path.basename(flowFilePath, '.or').replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Get the base path for resolving relative file paths
    const basePath = path.dirname(flowFilePath);
    
    // Generate the Airflow DAG code
    const airflowCode = generateAirflowDag(parsedFlow, dagId, basePath);
    
    // Write to output file if specified
    if (outputPath) {
      fs.writeFileSync(outputPath, airflowCode, 'utf8');
      console.log(`Airflow DAG written to: ${outputPath}`);
    }
    
    return airflowCode;
  } catch (err) {
    console.error(`Error converting flow to Airflow: ${err.message}`);
    throw err;
  }
}

/**
 * Process command line arguments and convert flow file
 */
function processCommandLine() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Orchestrator Flow to Airflow DAG Converter

Usage:
  node airflow.cjs <flow-file-path> [output-path]

Arguments:
  flow-file-path  Path to the .or flow file to convert
  output-path     Optional path to write the output Python file
                  If not provided, output is written to stdout
`);
    return;
  }
  
  const flowFilePath = args[0];
  const outputPath = args.length > 1 ? args[1] : null;
  
  try {
    const airflowCode = convertFlowToAirflow(flowFilePath, outputPath);
    
    if (!outputPath) {
      // If no output path is specified, print to stdout
      console.log(airflowCode);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// If this script is run directly, process command line arguments
if (require.main === module) {
  processCommandLine();
}

// Export functions for use as a library
module.exports = {
  parseFlowFile,
  convertFlowToAirflow,
  generateAirflowDag
};