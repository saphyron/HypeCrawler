const ORM = require('./../../data/general-orm-1.0.0');

// Number of tests: equal or greater than number of execution paths.
describe('CreateAnnonceTable function:', () => {
    it('should return fulfilled promise if table is successfully created', () => {
        const result = ORM.CreateAnnonceTable();
        expect(result).toBe(1); // res, matcher function
    });
});

