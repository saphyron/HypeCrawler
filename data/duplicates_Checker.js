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
    const query1 = `
            SELECT id, title, body_hash, DATE(timestamp) AS date_group, COUNT(*) as count
            FROM annonce
            WHERE timestamp BETWEEN CURDATE() AND CURDATE() + INTERVAL 1 DAY
            and body_hash IS NOT NULL
            GROUP BY title, body_hash, DATE(timestamp)
            HAVING count > 1;
        `;

    // SQL query to find potential duplicates based on title, body, and timestamp
    const query2 = `
            SELECT id, title, body_hash, DATE(timestamp) AS date_group, COUNT(*) as count
            FROM annonce
            WHERE body_hash IS NOT NULL
            GROUP BY title, body_hash, DATE(timestamp)
            HAVING count > 1;
    `;

    // Execute the query to find duplicates
    const results = await new Promise((resolve, reject) => {
        connection.query(query1, (error, results) => {
          if (error) {
            return reject("Error querying for duplicates: " + error);
          }
          resolve(results);
        });
      });
  
      // Check if any duplicates were found
      if (results.length > 0) {
        console.log(`Found ${results.length} potential duplicate(s).`);
  
        // Loop through the results to update the possible_duplicate column
        for (const row of results) {
          // SQL query to update the possible_duplicate column for all matching records
          const updateQuery = `
            UPDATE annonce
            SET possible_duplicate = 1
            WHERE title = ?
              AND body_hash = ?
              AND DATE(timestamp) = ?;
          `;
  
          // Execute the update query
          const updateResult = await new Promise((resolve, reject) => {
            connection.query(
              updateQuery,
              [row.title, row.body_hash, row.date_group], // Match the title, body_hash, and date
              (updateError, result) => {
                if (updateError) {
                  return reject(
                    "Error updating possible_duplicate: " + updateError
                  );
                }
                resolve(result);
              }
            );
          });
  
          // Log the outcome of the update operation
          if (updateResult.affectedRows > 0) {
            console.log(
              `Marked ${updateResult.affectedRows} records as possible duplicates for title '${row.title}' on ${row.date_group}.`
            );
          } else {
            console.log(
              `Record(s) for title '${row.title}' on ${row.date_group} were not updated.`
            );
          }
        }
      } else {
        console.log("No duplicates found.");
      }
    } catch (error) {
      console.error(`Error: ${error}`);
    } finally {
      if (connection) await orm.disconnectDatabase();
    }
  }

// Export the checkForDuplicates function as a module to be used elsewhere
module.exports = { checkForDuplicates };
