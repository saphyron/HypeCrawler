let ScraperInterface = require('./jobscraper-interface-1.0.0');


const TARGET_WEBSITE = 'https://www.jobindex.dk';
const REGION_NAMES = new Map([
    ['nordsjaelland', '/jobsoegning/nordsjaelland'],
    ['region-sjaelland', '/jobsoegning/region-sjaelland'],
    ['fyn', '/jobsoegning/fyn'],
    ['region-nordjylland', '/jobsoegning/region-nordjylland'],
    ['sydjylland', '/jobsoegning/sydjylland'],
    ['bornholm', '/jobsoegning/bornholm'],
    ['skaane', '/jobsoegning/skaane'],
    ['groenland', '/jobsoegning/groenland'],
    ['udlandet', '/jobsoegning/udlandet'],
    ['faeroeerne', '/jobsoegning/faeroeerne'],
    ['region-midtjylland', '/jobsoegning/region-midtjylland'],
    ['storkoebenhavn', '/jobsoegning/storkoebenhavn'],
]);
const PATH_VARIATIONS = [
    {
        URL_XPATH_CLASS: 'PaidJob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'PaidJob',
        TITLE_XPATH_ATTRIBUTES: '/a/*[1]'
    },
    {
        URL_XPATH_CLASS: 'jix_robotjob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'jix_robotjob',
        TITLE_XPATH_ATTRIBUTES: '/a/strong'
    }
];
const TOTAL_ADVERTS_SELECTOR = '//*[@id="result_list_box"]/div/div[1]/div/div[1]/h2/text()';
const TOTAL_ADVERTS_REGEX = /(\d*\.?\d*)/g;
const PAGE_TIMEOUT = 30000;

class JobindexScraper extends ScraperInterface {

    /**
     * Constructor for 
     * @class JobscraperTemplate
     * 
     * pageTimeout             integer setting timeout-time for page visits
     */
    constructor() {
        super(TARGET_WEBSITE, REGION_NAMES, PATH_VARIATIONS, TOTAL_ADVERTS_SELECTOR, TOTAL_ADVERTS_REGEX, PAGE_TIMEOUT);
    }

    /**
     * Extracts the text containing the innerHTML which holds the number of pages in the region.
     *
     * @since       1.0.0
     * @access      private
     *
     * @param page
     * @param listLength
     * @returns {Promise<number>}
     */
    async getNumPages(page, listLength) {
        try {
            // Collecting num of pages element
            let pageRefs = await page.$x("//*[@id=\"result_list_box\"]/div/div[3]/div[2]/a")
                .catch((error) => {
                    throw new Error("page.$x() → " + error);
                });

            // JobIndex

            // Extracting num of pages string
            let textNum = await page.evaluate(element => element.textContent, pageRefs[pageRefs.length-2])
                .catch((error) => {
                    throw new Error("page.evaluate() → " + error);
                });

            // Return number
            return Number(textNum);
        } catch (error) {
            console.log("Error at getNumPages() → " + error);
        }
    }

}

module.exports = JobindexScraper;