var fs = require('fs');
const { JSDOM } = require('jsdom');
const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN })

let dom
let document

let bookTitle
let bookTitleSearch
let bookAuthorNamesArray

var notion_author_filter_array = []

let blockId

var notion_blocks = []

const heading_1_template = {
    object: "block",
    type: "heading_1",
    heading_1: {
        text: [{
            type: "text",
            text: {
                content: ''
            }
        }]
    }
}

const heading_2_template = {
    object: "block",
    type: "heading_2",
    heading_2: {
        text: [{
            type: "text",
            text: {
                content: ''
            }
        }]
    }
}

const paragraph_template = {
    object: 'block',
    type: 'paragraph',
    paragraph: {
        text: [{
            type: 'text',
            text: {
                content: ''
            },
        }, ],
    },
}

const notion_author_filter_template = {
    property: 'Writer',
    text: {
        contains: ""
    },
}

let bookContent = {
    // 0: {
    //     text_content: "",
    //     highlight_color: ""
    // }
    // 1: {
    //     chapter: ""
    // }
}

function scrapBookAuthor() {

    bookTitle = document.querySelector(".bookTitle").textContent.trim()

    // Remove this bracket () if book title contains one.
    index = bookTitle.indexOf("(")
    if (index != -1) bookTitle = bookTitle.substring(0, index - 1)

    bookTitleSearch = bookTitle.split(" ").slice(0, 3).join(" ") // Pick the first three words

    var bookAuthor = document.querySelector(".authors").textContent.trim()
    bookAuthor = bookAuthor.replace(/,/g, "")

    bookAuthorNamesArray = bookAuthor.split(" ")
    bookAuthorNamesArray.forEach(bookAuthorName => {
        author_filter = JSON.parse(JSON.stringify(notion_author_filter_template, null, 2))
        author_filter.text.contains = bookAuthorName
        notion_author_filter_array.push(author_filter)
    })
}

function scrapBookContent() {
    const sectionHeadings = document.querySelectorAll(".sectionHeading")
    var noteHeadings = [...document.querySelectorAll(".noteHeading")] // use a Separator to convert to array.
    const noteTexts = document.querySelectorAll(".noteText")

    var sectionHeading = sectionHeadings[0]
    for (var i = 0; i < sectionHeadings.length; i++) {
        sectionHeading = sectionHeadings[i]
        sectionLocation = dom.nodeLocation(sectionHeading).startLine
        sectionContent = sectionHeading.textContent.trim()

        bookContent[sectionLocation] = {
            chapter: sectionContent
        }
    }

    var noteHeading = noteHeadings[0]
    var noteText = noteTexts[0]

    for (var i = 0; i < noteHeadings.length; i++) {
        if (noteHeadings[i].textContent.includes("Bookmark")) {
            noteHeadings.splice(i, 1)
        }
    }

    for (var i = 0; i < noteHeadings.length; i++) {
        noteHeading = noteHeadings[i]
        noteText = noteTexts[i]

        headingContent = noteHeading.textContent.trim()
        headingLocation = dom.nodeLocation(noteHeading).startLine

        if (headingContent.includes("Highlight")) { // is a highlight
            highlightColor = headingContent.substring(headingContent.indexOf("(") + 1, headingContent.indexOf(")"))
        } else { // is a note
            highlightColor = ""
        }

        noteContent = noteText.textContent.trim()

        bookContent[headingLocation] = {
            text_content: noteContent,
            highlight_color: highlightColor
        }
    }
}

function bookHeading() {
    var first_heading = JSON.parse(JSON.stringify(heading_1_template))
    first_heading.heading_1.text[0].text.content = "Kindle Highlights"
    notion_blocks.push(first_heading)
}

function bookContentToNotionJSON() {
    for (var key in bookContent) {
        if ("chapter" in bookContent[key]) {
            block_template = JSON.parse(JSON.stringify(heading_2_template))
            block_template.heading_2.text[0].text.content = bookContent[key].chapter
            notion_blocks.push(JSON.parse(JSON.stringify(block_template)))
        } else {
            block_template = JSON.parse(JSON.stringify(paragraph_template))
            block_template.paragraph.text[0].text.content = bookContent[key].text_content

            if (bookContent[key].highlight_color.length != "") { // ada highlight color means its a hightlight, not a note
                block_template.paragraph.text[0].annotations = {
                    "italic": true,
                    "color": bookContent[key].highlight_color + "_background"
                }
            }
            notion_blocks.push(JSON.parse(JSON.stringify(block_template)))
        }
    }
}

const fetchDatabase = async() => {
    const databaseId = process.env.BOOK_NOTES_DATABASE_ID
    const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
            and: [
                { or: notion_author_filter_array },
                {
                    property: 'Book Title',
                    text: {
                        contains: bookTitleSearch,
                    },
                }
            ]
        },
        sorts: [{
            property: 'Finished',
            direction: 'descending',
        }, ],
    })
    blockId = response.results[0].id
    console.log(response.results)
    return (blockId)
}

const appendPageContent = async(blockId) => {
    const response = await notion.blocks.children.append({
        block_id: blockId,
        children: notion_blocks
    })
}

async function beginImport() {
    scrapBookAuthor()
    const blockId = await fetchDatabase()
    console.log("Inserting to Notion Page...")

    console.log("Book Title: " + bookTitle)
    console.log("Book Author Names: " + bookAuthorNamesArray)
    scrapBookContent()

    bookHeading()
    bookContentToNotionJSON()

    await appendPageContent(blockId)
    console.log("Done!")
}

function init() {

    const input = process.argv[2];
    const read = fs.readFileSync(input, 'utf-8')
    dom = new JSDOM(read, {
        contentType: "text/html",
        includeNodeLocations: true
    })
    document = dom.window.document   
    beginImport()
}

init()