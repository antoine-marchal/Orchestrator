/**
 * Type definitions for Electron API
 */

interface ElectronAPI {
  /**
   * Set the window title
   * @param title The title to set
   */
  setTitle: (title: string) => void;
  
  /**
   * Register a callback for when a flow JSON is loaded
   * @param callback The callback function
   */
  onLoadFlowJson: (callback: (data: [string, string | null]) => void) => void;
  
  /**
   * Save flow data to a specific path
   * @param filePath The file path to save to
   * @param data The data to save
   */
  saveFlowToPath: (filePath: string, data: string) => void;
  
  /**
   * Open a file dialog to select a flow file (.or or .json)
   * @returns The selected file path and data, or null if cancelled
   */
  openFlowFile: () => Promise<{filePath: string, data: string} | null>;
  
  /**
   * Open a flow file in a new window
   * @param flowFilePath Path to the flow file to open
   * @returns True if successful, false otherwise
   */
  openFlowInNewWindow: (flowFilePath: string) => Promise<boolean>;
  
  /**
   * Open a save dialog to save flow data to a file (.or or .json)
   * @param data The data to save
   * @returns The saved file path, or null if cancelled
   */
  saveFlowAs: (data: string) => Promise<string | null>;
}

interface BackendAPI {
  /**
   * Execute a node job through the backend process
   * @param payload The job payload
   * @returns The job result
   */
  executeNodeJob: (payload: any) => Promise<any>;
  
  /**
   * Execute a flow file directly
   * @param flowFilePath Path to the flow file to execute
   * @param input Optional input data for the flow
   * @returns The result of the flow execution
   */
  executeFlowFile: (flowFilePath: string, input?: any) => Promise<any>;
  
  /**
   * Create a stop signal file for a running job
   * @param jobId The ID of the job to stop
   * @returns A promise that resolves when the stop signal is created
   */
  createStopSignal: (jobId: string) => Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
  backendAPI?: BackendAPI;
}