const orm = require("../database/databaseConnector");
const fs = require("fs");
const util = require("util");
const appendFileAsync = util.promisify(fs.appendFile); // Promisified version for async logging


/**
 * Function to update the binding table after a scrape.
 * It will update the `annonce_companyData_binding` table where certain conditions are true.
 *
 * @returns {Promise<void>} - A promise that resolves when the table update is completed.
 */
async function updateBindingTable() {
  let connection;
  try {
    // Establish a database connection
    connection = await orm.connectDatabase();
    console.log("Database connection established for binding table update.");

    // Define the SQL query to update the `annonce_companyData_binding` table
    const updateQuery = `
            INSERT INTO company_annonce_binding (annonce_id, cvrNummer)
            SELECT a.ID, a.CVR
            FROM annonce a
            INNER JOIN companydata c ON a.CVR = c.cvrNummer
            WHERE a.CVR IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 
                FROM company_annonce_binding cab
                WHERE cab.annonce_id = a.ID
            );

        `;

    // Execute the update query
    const results = await connection.query(updateQuery);

  } catch (error) {
    // Log the error asynchronously and continue with execution
    console.error("Error updating the binding table:", error);
    await logFailure("bindingTableUpdater", error);
  } finally {
    if (connection) {
      await orm.disconnectDatabase(connection);
      console.log("Database connection closed after binding table update.");
    }
  }
}

/**
 * Function to log any errors or failures to a log file asynchronously.
 *
 * @param {string} source - The name of the function or part of the system where the failure occurred.
 * @param {Error} error - The error object that contains information about the failure.
 */
async function logFailure(source, error) {
    const logMessage = `[${new Date().toISOString()}] Error in ${source}: ${error.message}\n`;
  
    try {
      // Append the error message to a log file asynchronously
      await appendFileAsync("error.log", logMessage);
    } catch (err) {
      console.error("Failed to write to log file:", err);
    }
  }

module.exports = { updateBindingTable };
