const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const shell = require('shelljs');
const { decode } = require('html-entities');

//CONFIG
const AUTO_SCRAPE_NEW_QUESTIONS = 1; // will automatically start the scraper every x hours
const REQUEST_EVERY_MS = 50;
const FILE_PATH = "results.json";


/*
Get the total amount of questions on TriviaDB by parsing the HTML on the homepage
Make a request to their API to ask for 50 random questions (the most that their API allows at a time)
Once the response comes, append it to an array, check if all the questions have been recorded, if not wait for a while and send another request
If all the question on TriviaDB have been scraped, parse the objects in the list and keep only dank memer related questions
Save to a file.
*/

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


async function getQuestionsFromApi(questions) {
    let response;
    try {
        response = await axios.get("https://opentdb.com/api.php?amount=50");
    } catch (error) {
        console.log("An error occoured in contacting the OpenTDB API: " + error)
    }
    const json = response.data;
    if (json.response_code != 0) {
        console.log("The response from the server resulted in a non zero code (this is NOT an HTTP code.)");
        return;
    }
    for (question of json.results) {
        if (!questions.find(q => q.question === question.question)) {
            questions.push(question);
        }
    }


}


async function getNumOfTriviaQuestions() {
    console.log("Getting the total number of trivia question on OpenTriviaDB...")
    const TRIVIADBHOME = "https://opentdb.com/";
    const response = (await axios.get(TRIVIADBHOME)).data;

    console.log("Parsing HTML reponse...")
    const $ = cheerio.load(response);
    const elementsWithClasses = $(".col-lg-8.col-lg-offset-2.text-center.text-shadow");
    if (elementsWithClasses.length != 1) {
        console.log("There are none, or more than one elements with the required class on the website. This is probably because of an update.");
        return;
    }
    if (!elementsWithClasses[0].children) {
        console.log("The required node has no children. This is probably because of an update.");
        return;
    }
    const header = elementsWithClasses[0].children.find(child => child.name === 'h4');
    if (!header) {
        console.log("The header containing relevant info could not be found. This is probably because of an update.");
        return;
    }
    const text = $(header).text();

    console.log(`Parsing text (${text})...`)
    //sample: 4,050 Verified Questions and 5,899 Pending Questions
    try {
        const total = parseInt(text.split(' ')[0].replace(',', '')); // The API only sends out verified questions
        console.log(`Got a total of ${total} questions on TriviaDB!`);
        return total;

    } catch (error) {
        console.log("The text could not be parsed, most likely the way the information is displayed on the website has changed.");
        return;
    }

}

async function work() {
    const numQuestions = await getNumOfTriviaQuestions();
    if (!numQuestions) return;
    let questions = []
    while (questions.length < numQuestions) {
        await getQuestionsFromApi(questions);
        console.log(`The list has ${questions.length} questions now.`);
        await sleep(REQUEST_EVERY_MS);
    }
    console.log("We have reached maximum capacity!");
    console.log("Filtering questions...")
    parsed_questions = []
    for (question of questions) {
        if (question.type === "multiple") {
            parsed_questions.push({
                question: decode(question.question),
                answer: decode(question.correct_answer)
            })
        }

    }
    console.log("Saving the content to a file...");
    fs.writeFileSync(FILE_PATH, JSON.stringify(parsed_questions));
    if (shell.which("git") && shell.which("bash")) {
        console.log("Uploading to remote respository. Please make sure your SSH keys and information have been added.");
        const result = shell.exec("bash update_repo.sh");
        console.log("Script exited with code " + result.code);
    }
    console.log("Done.")
}

async function daemon() {
    const milliseconds = AUTO_SCRAPE_NEW_QUESTIONS * 60 * 60 * 1000;
    while (true) {
        console.log("DAEMON: Starting task...")
        await work();
        console.log("DAEMON: Task finished, sleeping...")
        await sleep(milliseconds);
    }
}

if (AUTO_SCRAPE_NEW_QUESTIONS === 0) {
    work()
}
else {
    daemon()
}

