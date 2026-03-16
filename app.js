async function loadData() {
    const res = await fetch("tossups.json")
    const text = await res.text();

    const tossups = text.split("\n").filter(line => line.trim() !== "").map(line => JSON.parse(line));

    return tossups
} 

const manual_blacklist = ["including", "these", "their", "are", "have", "they", "such", "the", "a", "and", "cannot", "contains", "called", "own", "in", "into"]

const categories = {
    "Literature" : {
        subcategories : [
            "American Literature",
            "British Literature",
            "Classical Literature",
            "European Literature",
            "World Literature",
            "Other Literature"
        ],
        altcategories : [
            "Drama",
            "Long Fiction",
            "Poetry",
            "Short Fiction",
            "Misc Literature"
        ]
    },

    "History" : {
        subcategories : [
            "American History",
            "Ancient History",
            "European History",
            "World History",
            "Other History"
        ]
    },

    "Science" : {
        subcategories : [
            "Biology",
            "Chemistry",
            "Physics",
            "Other Science"
        ],
        altcategories : [
            "Math",
            "Astronomy",
            "Computer Science",
            "Earth Science",
            "Engineering",
            "Misc Science"
        ]
    },

    "Fine Arts" : {
        subcategories : [
            "Visual Fine Arts",
            "Auditory Fine Arts",
            "Other Fine Arts"
        ],
        altcategories : [
            "Architecture",
            "Dance",
            "Film",
            "Jazz",
            "Musicals",
            "Opera",
            "Photography",
            "Misc Arts"
        ]
    },

    "Religion" : {},
    
    "Mythology" : {},

    "Philosophy" : {},

    "Social Science" : {
        altcategories : [
            "Anthropology",
            "Economics",
            "Linguistics",
            "Psychology",
            "Sociology",
            "Other Social Science"
        ]
    },

    "Current Events" : {},

    "Geography" : {},

    "Other Academic" : {},

    "Pop Culture" : {
        subcategories : [
            "Movies",
            "Music",
            "Sports",
            "Television",
            "Video Games",
            "Other Pop Culture"
        ]
    }
}

function countNGrams(tossups) {
    // Count N-Grams
    let words = {};
    let bigrams = {};
    let trigrams = {};

    // Sample Common Words (n=10_000)
    let sample = {};
    let commonWords = {};
    for (let i = 0; i < tossups.length; i++){
        let question = tossups[i].question_sanitized.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
        for (let j =0; j < question.length; j++){
            sample[question[j]] = (sample[question[j]] || 0) + 1
        }
        if (i==10_000){
            break;
        }
    }
    for (let i = 0; i < manual_blacklist.length; i++){
        commonWords[manual_blacklist[i]] = true;
    }
    for (word in sample){
        if (sample[word] > 1000){
            commonWords[word] = true;
        }
    }

    for (let i =0; i < tossups.length; i++){
        let question = tossups[i].question_sanitized.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

        for (let j =0; j < question.length; j++){
            // Count 1-Gram
            const word = question[j]
            words[word] = (words[word] || 0) + 1

            if (j==question.length-1){
                continue;
            }
            // Count 2-Gram
            if (!commonWords[word] && !commonWords[question[j+1]]){
                const bigram = word + " " + question[j+1]
                bigrams[bigram] = (bigrams[bigram] || 0) + 1
            }

            if (j==question.length-2){
                continue;
            }
            // Count 3-Gram w/ Special Rule: no common words 
            if (!commonWords[word] && !commonWords[question[j+1]] && !commonWords[question[j+2]]){
                const trigram = word + " " + question[j+1] + " " + question[j+2]
                trigrams[trigram] = (trigrams[trigram] || 0) + 1
            }
        }
    }

    return {"words" : words, "bigrams" : bigrams, "trigrams" : trigrams};
}

async function main() {
    // Loading Data
    console.time("loading")
    const data = await loadData();
    console.timeEnd("loading")

    // Pre-calculate n-grams
    console.time("ngram")
    const totalFrequencies = countNGrams(data);
    console.timeEnd("ngram")

    console.log("Application Loaded")

    // Find Button press
    function onClick(){
        const topic = topicsField.options[topicsField.selectedIndex].text;
        let subcategory = "All";

        if (subcategoryField.options[subcategoryField.selectedIndex]){
            subcategory = subcategoryField.options[subcategoryField.selectedIndex].text;
        }
        const altcategory = altcategoryField.options[altcategoryField.selectedIndex].text;
        const answer = answerElement.value.toLowerCase();
        const minimum = Number(minimumElement.value);
        const certainty = Number(certaintyElement.value);

        let diffculties = difficultiesElement.value.trim().split(",")
        
        let finalDifficulties = {};
        // Convert difficulties to ints
        for (let i = 0; i < diffculties.length; i++){
            finalDifficulties[diffculties[i]] = true;
        }

        console.log(answer);
        console.log(finalDifficulties);
        console.log(topic);

        let tossups = [];

        // Fetch Tossups
        for (let i = 0; i < data.length; i++){
            const index = data[i];
            const thisAnswer = index.answer_sanitized.toLowerCase();
            const difficulty = index.difficulty["$numberInt"];
            const thisTopic = index.category;

            const thisSubcategory = index.subcategory && index.subcategory || "";
            const thisAltcategory = index.alternate_subcategory && index.alternate_subcategory || "";

            // Check difficulty match, text match, and category match
            if (finalDifficulties[difficulty] && thisAnswer.includes(answer) && topic==thisTopic){
                if (subcategory){
                    if (subcategory != "All" && thisSubcategory != subcategory){
                        continue;
                    }
                }
                if (altcategory != "All" && thisAltcategory != altcategory){
                    continue;
                }
                console.log("Push");
                tossups.push(index);
            }
        }

        console.log(tossups);
        let theseFrequencies = countNGrams(tossups);

        const classifiers = [
            [0.8, "CORE"],
            [0.4, "RELATED"],
            [0.1, "CONTEXTUAL"],
            [0, "N/A"]
        ]

        function computeNGramCertainties(gramFrequencies, n, commonWords){
            let certaintyTable = [];
            const nGramTotalFrequencies = totalFrequencies[n==1 && "words" || (n==2 && "bigrams" || "trigrams")]

            for (gram in gramFrequencies){
                const frequency = gramFrequencies[gram];
                const correlation = Math.floor((frequency/nGramTotalFrequencies[gram])*100_000)/100_000 // Round to 5 decimal places

                if (n==1 && correlation <= 0.001){ // Push as common word
                    commonWords[gram] = true;
                }
                if (frequency >= minimum) {
                    const tokens = gram.split(" ");
                    let flag = false;
                    for (let i = 0; i < tokens.length; i++){
                        if (commonWords[tokens[i]]){
                            flag = true
                            break;
                        }
                    }
                    if (!flag && correlation >= certainty){
                        let classifier = "";
                        for (let j = 0; j < classifiers.length; j++){
                            if (correlation >= classifiers[j][0]){
                                classifier = classifiers[j][1]
                                break;
                            }
                        }
                        certaintyTable.push([gram, correlation, frequency, classifier])
                    }
                }
            }

            return (n==1 && [certaintyTable, commonWords] || certaintyTable)
        }   

        // Directly compute word frequencies

        let values = computeNGramCertainties(theseFrequencies.words, 1, {})
        word_list = values[0];
        commonWords = values[1];

        word_list.sort((a,b) => b[1] - a[1]);

        // Directly compute bigram frequencies
        let bigrams_list = computeNGramCertainties(theseFrequencies.bigrams, 2, commonWords);
        bigrams_list.sort((a,b) => b[1] - a[1]);

        // Directly compute trigram frequencies
        let trigrams_list = computeNGramCertainties(theseFrequencies.trigrams, 3, commonWords);
        trigrams_list.sort((a,b) => b[1] - a[1]);

        // Filter Words for Tokens of Bigrams
        let bigramTokens = {};
        let finalWordList = [];

        // Find Tokens
        for (let i = 0; i < bigrams_list.length; i++){
            const index = bigrams_list[i]
            bigramTokens[index[0].split(" ")[0]] = true;
            bigramTokens[index[0].split(" ")[1]] = true;
        }

        // Search For Tokens in Word list
        for (let i = 0; i < word_list.length; i++){
            if (!bigramTokens[word_list[i][0]]){
                finalWordList.push(word_list[i]);
            }
        }

        // Filter Bigrams for Subset of Trigram
        let trigramTokens = {};
        let finalBigramList = [];

        // Find tokens
        for (let i = 0; i < trigrams_list.length; i++){
            const tokens = trigrams_list[i][0].split(" ");
            const token1 = tokens[0] + " " + tokens[1];
            const token2 = tokens[1] + " " + tokens[2];
            trigramTokens[token1] = true;
            trigramTokens[token2] = true;
        }
        
        // Search For Tokens
        for (let i = 0; i < bigrams_list.length; i++){
            if (!trigramTokens[bigrams_list[i][0]]){
                finalBigramList.push(bigrams_list[i])
            }
        }

        let word_string = "";
        let bigram_string = "";
        let trigram_string = "";

        for (let i = 0; i < finalWordList.length; i++){
            word_string += (answer + ", " + finalWordList[i][0])
            if (i < finalWordList.length-1){
                word_string += "\n"
            }
        }

        for (let i = 0; i < finalBigramList.length; i++){
            bigram_string += (answer + ", " + finalBigramList[i][0])
            if (i < finalBigramList.length-1){
                bigram_string += "\n"
            }
        }

        
        for (let i = 0; i < trigrams_list.length; i++){
            trigram_string += (answer + ", " + trigrams_list[i][0])
            if (i < trigrams_list.length-1){
                trigram_string += "\n"
            }
        }

        console.log(finalWordList);
        console.log(finalBigramList);
        console.log(trigrams_list);

        const final_string = word_string + "\n" + bigram_string + "\n" + trigram_string
        navigator.clipboard.writeText(final_string)
    }

    // Listener Functions
    function updateFields(fieldType, fields){
        for (let i = 0; i < 6; i++){
            let fieldElement = document.getElementById(fieldType + "Value" + String(i+1));
            fieldElement.style.visibility = "hidden";
        }
        for (let i = 0; i < fields.length; i++){
            let fieldElement = document.getElementById(fieldType + "Value" + String(i+1));
            fieldElement.textContent = fields[i];
            fieldElement.value = fields[i];
            fieldElement.style.visibility = "visible";
        }
    }

    function categoryChanged(){
        // Fetch topic and whether or not its been reset
        const topic = topicsField.options[topicsField.selectedIndex].text;
        const reset = topic == "Category";
        // Update Fields
        topicsField.style.color = reset && "rgb(165, 165, 165)" || "rgb(0,0,0)";
        subcategoryField.style.visibility = reset && "hidden" || "visible";
        subcategoryField.value = "All";
        altcategoryField.value = "All";
        altcategoryField.style.visibility = "hidden";
        // Guard Statement
        if (reset){
            return;
        }
        // Update Fields
        const newFields = categories[topic];
        if ("subcategories" in newFields){          // Subcategories 
            updateFields("Sub", newFields.subcategories);
            if ("altcategories" in newFields){      // Subcategories and Altcategories
                updateFields("Alt", newFields.altcategories);
            }
        } else if ("altcategories" in newFields){   // Only Altcategories
            updateFields("Alt", newFields.altcategories);
            subcategoryField.style.visibility = "hidden"
            altcategoryField.style.visibility = "visible";
        } else {                                    // No subcategories or altcategories
            subcategoryField.style.visibility = "hidden";
        }
    }

    function subcategoryChange(){
        const subcategory = subcategoryField.options[subcategoryField.selectedIndex].text;
        const reset = subcategory == "All"

        subcategoryField.style.color = reset && "rgb(165, 165, 165)" || "rgb(0,0,0)";
        altcategoryField.style.visibility = reset && "hidden" || "visible";
        altcategoryField.value = "";
    }

    function altcategoryChange(){
        const altcategory = altcategoryField.options[altcategoryField.selectedIndex].text;
        const reset = altcategory == "All"

        altcategoryField.style.color = reset && "rgb(165, 165, 165)" || "rgb(0,0,0)";
    }

    // Important Elements
    const findButton = document.getElementById("FindButton");
    findButton.addEventListener("click", onClick)

    const topicsField = document.getElementById("TopicsField");
    topicsField.addEventListener("change", categoryChanged)

    const subcategoryField = document.getElementById("SubcategoryField");
    subcategoryField.addEventListener("change", subcategoryChange)

    const altcategoryField = document.getElementById("AltcategoryField");
    altcategoryField.addEventListener("change", altcategoryChange)

    const answerElement = document.getElementById("AnswerField");
    const minimumElement = document.getElementById("MinimumField");
    const certaintyElement = document.getElementById("CertaintyField");
    const difficultiesElement = document.getElementById("DifficultiesField");
}

main();