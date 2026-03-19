const manualBlacklist = [
    "including",
    "these",
    "their",
    "are",
    "have",
    "they",
    "such",
    "the",
    "a",
    "and",
    "cannot",
    "contains",
    "called",
    "own",
    "in",
    "into"
];

const classifiers = [
    [0.8, "CORE"],
    [0.4, "RELATED"],
    [0.1, "CONTEXTUAL"],
    [0, "N/A"]
];

let data = null;
let totalFrequencies = null;
let initPromise = null;

function postStatus(message, tone = "info", ready = false) {
    self.postMessage({
        type: "status",
        message,
        payload: { tone, ready }
    });
}

function tokenizeQuestion(question) {
    return question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}

function buildDifficultyLookup(difficulties) {
    const lookup = {};

    for (let i = 0; i < difficulties.length; i++) {
        lookup[difficulties[i]] = true;
    }

    return lookup;
}

function countNGrams(tossups) {
    const words = {};
    const bigrams = {};
    const trigrams = {};
    const sample = {};
    const commonWords = {};

    for (let i = 0; i < tossups.length; i++) {
        const question = tokenizeQuestion(tossups[i].question_sanitized);

        for (let j = 0; j < question.length; j++) {
            sample[question[j]] = (sample[question[j]] || 0) + 1;
        }

        if (i === 10_000) {
            break;
        }
    }

    for (let i = 0; i < manualBlacklist.length; i++) {
        commonWords[manualBlacklist[i]] = true;
    }

    for (const word in sample) {
        if (sample[word] > 1000) {
            commonWords[word] = true;
        }
    }

    for (let i = 0; i < tossups.length; i++) {
        const question = tokenizeQuestion(tossups[i].question_sanitized);

        for (let j = 0; j < question.length; j++) {
            const word = question[j];
            words[word] = (words[word] || 0) + 1;

            if (j === question.length - 1) {
                continue;
            }

            const secondWord = question[j + 1];
            if (!commonWords[word] && !commonWords[secondWord]) {
                const bigram = word + " " + secondWord;
                bigrams[bigram] = (bigrams[bigram] || 0) + 1;
            }

            if (j === question.length - 2) {
                continue;
            }

            const thirdWord = question[j + 2];
            if (!commonWords[word] && !commonWords[secondWord] && !commonWords[thirdWord]) {
                const trigram = word + " " + secondWord + " " + thirdWord;
                trigrams[trigram] = (trigrams[trigram] || 0) + 1;
            }
        }
    }

    return { words, bigrams, trigrams };
}

function computeNGramCertainties(gramFrequencies, n, commonWords, minimum, certainty) {
    const certaintyTable = [];
    const nGramType = n === 1 ? "words" : (n === 2 ? "bigrams" : "trigrams");
    const nGramTotalFrequencies = totalFrequencies[nGramType];

    for (const gram in gramFrequencies) {
        const totalFrequency = nGramTotalFrequencies[gram];
        if (!totalFrequency) {
            continue;
        }

        const frequency = gramFrequencies[gram];
        const correlation = Math.floor((frequency / totalFrequency) * 100_000) / 100_000;

        if (n === 1 && correlation <= 0.001) {
            commonWords[gram] = true;
        }

        if (frequency < minimum) {
            continue;
        }

        const tokens = gram.split(" ");
        let containsCommonWord = false;

        for (let i = 0; i < tokens.length; i++) {
            if (commonWords[tokens[i]]) {
                containsCommonWord = true;
                break;
            }
        }

        if (containsCommonWord || correlation < certainty) {
            continue;
        }

        let classifier = "";
        for (let i = 0; i < classifiers.length; i++) {
            if (correlation >= classifiers[i][0]) {
                classifier = classifiers[i][1];
                break;
            }
        }

        certaintyTable.push([gram, correlation, frequency, classifier]);
    }

    return n === 1 ? [certaintyTable, commonWords] : certaintyTable;
}

function filterWordList(wordList, bigramsList) {
    const bigramTokens = {};
    const finalWordList = [];

    for (let i = 0; i < bigramsList.length; i++) {
        const tokens = bigramsList[i][0].split(" ");
        bigramTokens[tokens[0]] = true;
        bigramTokens[tokens[1]] = true;
    }

    for (let i = 0; i < wordList.length; i++) {
        if (!bigramTokens[wordList[i][0]]) {
            finalWordList.push(wordList[i]);
        }
    }

    return finalWordList;
}

function filterBigramList(bigramsList, trigramsList) {
    const trigramTokens = {};
    const finalBigramList = [];

    for (let i = 0; i < trigramsList.length; i++) {
        const tokens = trigramsList[i][0].split(" ");
        trigramTokens[tokens[0] + " " + tokens[1]] = true;
        trigramTokens[tokens[1] + " " + tokens[2]] = true;
    }

    for (let i = 0; i < bigramsList.length; i++) {
        if (!trigramTokens[bigramsList[i][0]]) {
            finalBigramList.push(bigramsList[i]);
        }
    }

    return finalBigramList;
}

async function loadData() {
    const response = await fetch("tossups.json");
    const text = await response.text();

    return text
        .split("\n")
        .filter(line => line.trim() !== "")
        .map(line => JSON.parse(line));
}

async function initData() {
    if (data && totalFrequencies) {
        return;
    }

    if (!initPromise) {
        initPromise = (async () => {
            postStatus("Loading tossups...", "info", false);
            data = await loadData();

            postStatus("Precomputing global n-grams in the background...", "info", false);
            totalFrequencies = countNGrams(data);

            postStatus("Tossups loaded. You can search now.", "success", true);
        })().catch(error => {
            initPromise = null;
            throw error;
        });
    }

    await initPromise;
}

function findMatchingTossups(filters) {
    const matches = [];
    const difficultyLookup = buildDifficultyLookup(filters.difficulties);

    for (let i = 0; i < data.length; i++) {
        const tossup = data[i];
        const answer = tossup.answer_sanitized.toLowerCase();
        const difficulty = tossup.difficulty["$numberInt"];

        if (!difficultyLookup[difficulty]) {
            continue;
        }

        if (!answer.includes(filters.answer)) {
            continue;
        }

        if (tossup.category !== filters.topic) {
            continue;
        }

        const subcategory = tossup.subcategory || "";
        const altcategory = tossup.alternate_subcategory || "";

        if (filters.subcategory !== "All" && subcategory !== filters.subcategory) {
            continue;
        }

        if (filters.altcategory !== "All" && altcategory !== filters.altcategory) {
            continue;
        }

        matches.push(tossup);
    }

    return matches;
}

function buildPavlovs(filters) {
    const matches = findMatchingTossups(filters);
    const theseFrequencies = countNGrams(matches);
    const values = computeNGramCertainties(theseFrequencies.words, 1, {}, filters.minimum, filters.certainty);
    const wordList = values[0];
    const commonWords = values[1];
    const bigramsList = computeNGramCertainties(theseFrequencies.bigrams, 2, commonWords, filters.minimum, filters.certainty);
    const trigramsList = computeNGramCertainties(theseFrequencies.trigrams, 3, commonWords, filters.minimum, filters.certainty);

    wordList.sort((a, b) => b[1] - a[1]);
    bigramsList.sort((a, b) => b[1] - a[1]);
    trigramsList.sort((a, b) => b[1] - a[1]);

    return {
        answer: filters.answer,
        tossupCount: matches.length,
        words: filterWordList(wordList, bigramsList),
        bigrams: filterBigramList(bigramsList, trigramsList),
        trigrams: trigramsList
    };
}

self.addEventListener("message", async event => {
    try {
        if (event.data.type === "init") {
            await initData();
            return;
        }

        if (event.data.type === "find") {
            await initData();
            postStatus("Crunching n-grams for your search...", "info", true);

            const payload = buildPavlovs(event.data.payload);
            self.postMessage({ type: "results", payload });
        }
    } catch (error) {
        self.postMessage({
            type: "error",
            message: error instanceof Error ? error.message : "Unexpected worker error."
        });
    }
});
