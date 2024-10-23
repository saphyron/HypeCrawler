/**
 * @file main.js
 * @description Entry point for executing the parallel data processing module.
 */

const parallel = require("./main_parallel");

/**
 * Executes the main parallel processing function and handles any errors.
 *
 * @async
 * @function main
 * @returns {Promise<void>}
 * @throws Will throw an error if the parallel processing fails.
 */
async function main() {
  try {
    // Invoke the main_parallel function from the parallel module
    await parallel.main_parallel();
  } catch (error) {
    console.error("Error during data upload:", error);
    // Re-throw the error to be caught in the main execution block below
    throw error;
  }
}

/**
 * Initiates the main function and handles the outcome.
 * Logs the success or failure of the process and exits the process with an appropriate code.
 */
main().then(
  () => {
    console.log("Process finished successfully.");
    process.exit(0); // Exit with code 0 indicating success
  },
  (error) => {
    console.error("Process finished with errors:", error);
    process.exit(1); // Exit with code 1 indicating failure
  }
);
