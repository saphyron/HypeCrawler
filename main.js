const parallel = require("./main_parallel");
const sequential = require("./main_sequential");

async function main() {
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