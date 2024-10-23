/**
 * @file csvConverter.js
 * @description Exports data from the database to a CSV file based on a selected query.
 * It connects to the database, executes a query, processes the results, and writes them to a CSV file.
 */

const fs = require("fs").promises; // Use non-blocking file operations
const path = require("path"); // Path module for handling file paths
const orm = require("../database/databaseConnector"); // ORM for database operations
const { parse } = require("json2csv"); // Library for converting JSON to CSV format

/**
 * Exports data to a CSV file based on the provided query number.
 * Establishes a database connection, executes the query, processes the results,
 * and writes the data to a CSV file in the specified directory.
 *
 * @async
 * @function exportToCSV
 * @param {number} queryNumber - The number representing the SQL query to execute.
 * @returns {Promise<void>}
 * @throws Will throw an error if the export process fails.
 */
async function exportToCSV(queryNumber) {
  console.log("Starting exportToCSV function");
  let connection;

  try {
    // Establish a database connection
    connection = await orm.connectDatabase();
    console.log("Database connection established");

    // Get today's date in the local time zone
    const today = new Date();

    // Format today's date as 'YYYY-MM-DD'
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0"); // Months are zero-based
    const day = String(today.getDate()).padStart(2, "0");
    const formattedDate = `${year}-${month}-${day}`;

    // Calculate the next date for the range condition
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextYear = tomorrow.getFullYear();
    const nextMonth = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const nextDay = String(tomorrow.getDate()).padStart(2, "0");
    const nextDate = `${nextYear}-${nextMonth}-${nextDay}`;

    // Retrieve the SQL query based on the query number
    const query = sqlQueries(queryNumber, formattedDate, nextDate);

    // Execute the query and process results with async/await
    const [results, fields] = await executeQuery(connection, query);

    if (!results.length) {
      console.log("No data returned from the query.");
      return;
    }

    // Transform the results into JSON format suitable for CSV conversion
    const jsonData = results.map((row) =>
      fields.reduce((jsonObject, field) => {
        let value = row[field.name];

        // Process buffer and string values
        value = Buffer.isBuffer(value) ? value.toString("utf8") : value;
        value = value === null || value === "" ? "n/a" : value;
        value =
          typeof value === "string"
            ? value.replace(/\r?\n|\r/g, " ").trim()
            : value;

        jsonObject[field.name] = value;
        return jsonObject;
      }, {})
    );

    const resultCount = jsonData.length;
    console.log("Result count:", resultCount);

    // Generate filename using date and result count
    const fileName = `${formattedDate}_All Fields_${resultCount}_data.csv`;
    const outputPath = path.resolve(
      "C:\\Users\\jgra\\OneDrive - EFIF\\Skrivebord\\CSV Files",
      fileName
    );

    console.log("Writing CSV file:", outputPath);

    // Write CSV asynchronously
    const csvContent = parse(jsonData); // Convert JSON data to CSV format
    await fs.writeFile(outputPath, csvContent, "utf8");
    console.log("CSV file written successfully");
  } catch (error) {
    console.error("Error during exportToCSV:", error);
    throw error;
  } finally {
    if (connection) {
      // Close the database connection
      await orm.disconnectDatabase();
    }
  }
}

/**
 * Retrieves the SQL query based on the provided query number.
 * Throws an error if an invalid query number is provided.
 *
 * @function sqlQueries
 * @param {number} queryNumber - The number representing the SQL query to retrieve.
 * @param {string} formattedDate - The current date formatted as 'YYYY-MM-DD'.
 * @param {string} nextDate - The next date formatted as 'YYYY-MM-DD'.
 * @returns {string} - The SQL query string.
 * @throws Will throw an error if an invalid query number is provided.
 */
function sqlQueries(queryNumber, formattedDate, nextDate) {
  const queries = {
    1: `
            SELECT a.id, a.body as searchable_body, r.region_id, r.name as region_name, a.timestamp, a.title, a.cvr
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            WHERE DATE(a.timestamp) = '${formattedDate}';
        `,
    2: `
            SELECT *
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            WHERE a.timestamp >= '${formattedDate} 00:00:00'
            AND a.timestamp <  '${nextDate} 00:00:00';
        `,
    3: `
            SELECT *
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            WHERE r.name = 'cyber';
        `,
    4: `
            SELECT *
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id;
        `,
  };

  if (!queries[queryNumber]) throw new Error("Invalid query number");
  return queries[queryNumber];
}

/**
 * Executes the provided SQL query using the given database connection.
 *
 * @function executeQuery
 * @param {object} connection - The database connection object.
 * @param {string} query - The SQL query string to execute.
 * @returns {Promise<Array>} - A promise that resolves to an array containing the results and fields.
 * @throws Will reject if the query execution fails.
 */
function executeQuery(connection, query) {
  return new Promise((resolve, reject) => {
    connection.query(query, (err, results, fields) => {
      if (err) return reject(err);
      resolve([results, fields]);
    });
  });
}

// Export the exportToCSV function for use in other modules
module.exports = { exportToCSV };
