const orm = require("./general-orm-1.0.0");

// Function to check for duplicates and update the possible_duplicate column
async function checkForDuplicates() {
    let connection;
    try {
        connection = await orm.connectDatabase();

        const query = `
            SELECT id, COUNT(*) as count
            FROM annonce
            WHERE DATE(timestamp) = '2024-08-29'
            GROUP BY title, body, DATE(timestamp)
            HAVING count > 1;
        `;

        const results = await new Promise((resolve, reject) => {
            connection.query(query, (error, results) => {
                if (error) {
                    return reject("Error querying for duplicates: " + error);
                }
                resolve(results);
            });
        });

        if (results.length > 0) {
            console.log(`Found ${results.length} potential duplicate(s).`);

            for (const row of results) {
                const updateQuery = `
                    UPDATE annonce
                    SET possible_duplicate = TRUE
                    WHERE title = (SELECT title FROM annonce WHERE id = ?) 
                      AND body = (SELECT body FROM annonce WHERE id = ?) 
                      AND DATE(timestamp) = (SELECT DATE(timestamp) FROM annonce WHERE id = ?)
                      AND possible_duplicate != TRUE;
                `;

                const updateResult = await new Promise((resolve, reject) => {
                    connection.query(
                        updateQuery,
                        [row.id, row.id, row.id],
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

                if (updateResult.affectedRows > 0) {
                    console.log(
                        `Marked record with ID ${row.id} as a possible duplicate.`
                    );
                } else {
                    console.log(`Record with ID ${row.id} was already marked as a possible duplicate or was not updated.`);
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


// Run the function
module.exports = { checkForDuplicates };

// If you want to execute the function directly, uncomment the following line:
// checkForDuplicates();
