const parallel = require("./main_parallel");
// const sequential = require("./main_sequential");


async function main() {
  try {
    await parallel.main_parallel();
  } catch (error) {
    console.error("Error during data upload:", error);
    throw error; // Re-throw the error to be caught in the main execution block
  }
}

// Main function execution
main().then(
  () => {
    console.log("Process finished successfully.");
    process.exit(0);
  },
  (error) => {
    console.error("Process finished with errors:", error);
    process.exit(1); // Exit with error code
  }
);
