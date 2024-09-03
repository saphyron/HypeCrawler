// Import the ORM module for database operations
const orm = require("./general-orm-1.0.0");

/**
 * Function to check for duplicates and update the possible_duplicate column.
 * This function connects to the database, identifies potential duplicates in the `annonce` table 
 * based on the title, body, and timestamp of records from the current date, and updates a 
 * `possible_duplicate` column for those records.
 *
 * @returns {Promise<void>} - A promise that resolves when the duplicate check is completed.
 */
async function checkForDuplicates() {
    let connection; // Variable to hold the database connection

    try {
        // Establish a database connection
        connection = await orm.connectDatabase();

        // SQL query to find potential duplicates based on title, body, and timestamp
        const query = `
            SELECT id, COUNT(*) as count
            FROM annonce
            WHERE DATE(timestamp) = curdate()
            GROUP BY title, body, DATE(timestamp)
            HAVING count > 1;
        `;

        // Execute the query and handle the results
        const results = await new Promise((resolve, reject) => {
            connection.query(query, (error, results) => {
                if (error) {
                    return reject("Error querying for duplicates: " + error); // Reject the promise on error
                }
                resolve(results); // Resolve the promise with the results
            });
        });

        // Check if any duplicates were found
        if (results.length > 0) {
            console.log(`Found ${results.length} potential duplicate(s).`);

            // Loop through the results to update the possible_duplicate column
            for (const row of results) {
                // SQL query to update the possible_duplicate column for the found duplicates
                const updateQuery = `
                    UPDATE annonce
                    SET possible_duplicate = TRUE
                    WHERE title = (SELECT title FROM annonce WHERE id = ?) 
                      AND body = (SELECT body FROM annonce WHERE id = ?) 
                      AND DATE(timestamp) = (SELECT DATE(timestamp) FROM annonce WHERE id = ?)
                      AND possible_duplicate != TRUE;
                `;

                // Execute the update query
                const updateResult = await new Promise((resolve, reject) => {
                    connection.query(
                        updateQuery,
                        [row.id, row.id, row.id], // Bind the row ID to the query
                        (updateError, result) => {
                            if (updateError) {
                                return reject(
                                    "Error updating possible_duplicate: " + updateError
                                ); // Reject the promise on error
                            }
                            resolve(result); // Resolve the promise with the update result
                        }
                    );
                });

                // Log the outcome of the update operation
                if (updateResult.affectedRows > 0) {
                    console.log(
                        `Marked record with ID ${row.id} as a possible duplicate.`
                    );
                } else {
                    console.log(`Record with ID ${row.id} was already marked as a possible duplicate or was not updated.`);
                }
            }
        } else {
            console.log("No duplicates found."); // Log if no duplicates were found
        }
    } catch (error) {
        console.error(`Error: ${error}`); // Log any errors that occur during the process
    } finally {
        // Ensure the database connection is closed
        if (connection) await orm.disconnectDatabase();
    }
}

// Export the checkForDuplicates function as a module to be used elsewhere
module.exports = { checkForDuplicates };
