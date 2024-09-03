// Import required modules
const fs = require('fs'); // File system module for reading and writing files
const path = require('path'); // Path module for handling file and directory paths
const orm = require('./general-orm-1.0.0'); // ORM module for database operations
//const orm = require('./general-orm-1.0.1-pool'); // Alternative ORM module, commented out for now
const { parse } = require('json2csv'); // Module for converting JSON to CSV format

/**
 * Function to export data from the database to a CSV file.
 * This function connects to the database, retrieves data based on the current date,
 * converts the data to CSV format, and writes it to a file.
 *
 * @returns {Promise<void>} - A promise that resolves when the CSV file is successfully written.
 */
async function exportToCSV() {
    console.log('Starting exportToCSV function');
    let connection; // Variable to hold the database connection

    try {
        // Establish a database connection
        connection = await orm.connectDatabase();
        console.log('Database connection established');

        const today = new Date(); // Get the current date

        const querychosen = sqlQueries(2); // Choose the SQL query to execute

        // Execute the chosen query
        console.log('Executing query:', querychosen);
        connection.query(querychosen, (err, results, fields) => {
            if (err) {
                console.error('Error executing query:', err);
                connection.end(); // End the connection if there's an error
                return;
            }

            console.log('Query executed successfully');

            // Check if the query returned any results
            if (results.length === 0) {
                console.log('No data returned from the query.');
                connection.end(); // End the connection if no data is returned
                return;
            }

            // Convert the results to JSON and handle special cases
            const jsonData = results.map(row => {
                let jsonObject = {}; // Initialize an object to store processed row data
                fields.forEach((field) => {
                    let value = row[field.name]; // Get the value of the current field

                    // If the field is a Buffer, convert it to a string
                    if (Buffer.isBuffer(value)) {
                        value = value.toString('utf8');
                    }

                    // Convert null or empty values to "n/a"
                    if (value === null || value === '') {
                        value = 'n/a';
                    }

                    // Ensure proper handling of text fields, such as replacing newlines
                    if (typeof value === 'string') {
                        value = value.replace(/\r?\n|\r/g, ' ').trim(); // Replace newlines with space and trim
                    }

                    // Add the processed value to the JSON object
                    jsonObject[field.name] = value;
                });
                return jsonObject; // Return the JSON object for the current row
            });

            const resultCount = jsonData.length; // Get the number of results
            console.log('Result count:', resultCount);

            // Generate the filename using the current date and result count
            const datePart = today.toISOString().split('T')[0]; // Format the date as YYYY-MM-DD
            const fileName = `${datePart}_All Fields_${resultCount}_data.csv`; // Create a filename

            // Define the output directory and resolve the full output path
            const outputDir = 'C:\\Users\\jgra\\OneDrive - EFIF\\Skrivebord\\CSV Files'; // Define the directory
            const outputPath = path.resolve(outputDir, fileName); // Resolve the full file path

            console.log('Writing CSV file:', outputPath);

            // Convert JSON data to CSV format and write it to the file
            const csvContent = parse(jsonData);
            fs.writeFileSync(outputPath, csvContent, 'utf8');
            console.log('CSV file written successfully');
        });
    } catch (error) {
        console.log("Error at main → connectDatabase(): " + error);
        throw error; // Re-throw the error after logging it
    } finally {
        if (connection) await orm.disconnectDatabase(); // Disconnect from the database if connected
    }
}

/**
 * Function to return an SQL query based on the input number.
 * This function returns different SQL queries to retrieve data from the database
 * based on the input query number.
 *
 * @param {number} queryNumber - The number representing the desired query.
 * @returns {string} - The SQL query string.
 * @throws {Error} - Throws an error if an invalid query number is provided.
 */
function sqlQueries(queryNumber) {
    // Get the current date formatted as YYYY-MM-DD
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0]; // Format the date as YYYY-MM-DD

    // SQL queries to retrieve data from the database
    const query1 = `
        SELECT a.id, a.body as searchable_body, r.region_id, r.name as region_name, a.timestamp, a.title, a.cvr
        FROM annonce a
        INNER JOIN region r ON r.region_id = a.region_id
        WHERE DATE(a.timestamp) = '${formattedDate}'
        GROUP BY a.id;
    `;

    const query2 = `
        SELECT *
        FROM annonce a
        INNER JOIN region r ON r.region_id = a.region_id
        WHERE DATE(a.timestamp) = '${formattedDate}'
        GROUP BY a.id;
    `;

    const query3 = `
        SELECT *
        FROM annonce a
        INNER JOIN region r ON r.region_id = a.region_id
        WHERE r.name = 'cyber'
        GROUP BY a.id;
    `;

    const query4 = `
        SELECT *
        FROM annonce a
        INNER JOIN region r ON r.region_id = a.region_id
        GROUP BY a.id;
    `;

    // Returning the query based on the input number
    switch (queryNumber) {
        case 1:
            return query1;
        case 2:
            return query2;
        case 3:
            return query3;
        case 4:
            return query4;
        default:
            throw new Error("Invalid query number"); // Throw an error for invalid query numbers
    }
}

// Export the exportToCSV function as a module
module.exports = { exportToCSV };
