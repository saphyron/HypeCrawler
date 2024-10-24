/**
 * @file region.js
 * @description Defines the Region class representing a record in the 'region' table of the database.
 * This class models the structure of a region with properties that map to the database fields.
 */

class Region {
    /**
     * Creates an instance of the Region class.
     *
     * @param {string} name - The name of the region.
     */
    constructor(name) {
        this.name = name;
    }
}

// Export the Region class for use in other modules
module.exports = Region;
