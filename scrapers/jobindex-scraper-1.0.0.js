let ScraperInterface = require('./jobscraper-interface-1.0.0');


const TARGET_WEBSITE = 'https://www.jobindex.dk';
const REGION_NAMES = new Map([
    ['faeroeerne', '/jobsoegning/faeroeerne'],
    ['region-midtjylland', '/jobsoegning/region-midtjylland'],
    ['storkoebenhavn', '/jobsoegning/storkoebenhavn'],
    ['nordsjaelland', '/jobsoegning/nordsjaelland'],
    ['region-sjaelland', '/jobsoegning/region-sjaelland'],
    ['fyn', '/jobsoegning/fyn'],
    ['region-nordjylland', '/jobsoegning/region-nordjylland'],
    ['sydjylland', '/jobsoegning/sydjylland'],
    ['bornholm', '/jobsoegning/bornholm'],
    ['skaane', '/jobsoegning/skaane'],
    ['groenland', '/jobsoegning/groenland'],
    ['udlandet', '/jobsoegning/udlandet']
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
const PAGE_TIMEOUT = 30000;

class JobindexScraper extends ScraperInterface {

    /**
     * Constructor for 
     * @class JobscraperTemplate
     * 
     * pageTimeout             integer setting timeout-time for page visits
     */
    constructor() {
        super(TARGET_WEBSITE, REGION_NAMES, PATH_VARIATIONS, TOTAL_ADVERTS_SELECTOR, PAGE_TIMEOUT);
    }

}

module.exports = JobindexScraper;