import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));



dotenv.config();
const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });
  
  await db.connect();

const app = express();
const port = 3000;
app.set("view engine", "ejs");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", async (req, res) => {
    const query = req.query.q || "harry potter";
    try {
        const response = await axios.get(`https://openlibrary.org/search.json?q=${query}`);
        const books = response.data.docs.slice(0, 20);
        res.render("index.ejs",
            {
                books, query
            }
        );

    } catch (error) {
        res.send("Error");
    }
});

app.get("/book/:id", async (req, res) => {
    try {
        const workId = req.params.id;
        const response = await axios.get(`https://openlibrary.org/works/${workId}.json`);
        const notesResult = await db.query(`SELECT
            notes.id AS note_id,
            notes.note,
            notes.rating,
            notes.created_at,
            notes.book_id,
            books.work_id
         FROM notes
         JOIN books
         ON notes.book_id = books.id
         WHERE books.work_id = $1
         ORDER BY notes.created_at DESC`,
            [workId]);
        res.render("book", {
            book: response.data,
            workId: workId,
            notes: notesResult.rows
        });

    } catch (err) {
        console.log(err);
        res.send("Error loading book.")
    }
});

app.post("/book/:id/note", async (req, res) => {
    try {
        const workId = req.params.id;
        const { note, rating } = req.body;
        const response = await axios.get(
            `https://openlibrary.org/works/${workId}.json`
        );
        const book = response.data;
        const title = book.title;
        const coverId = book.covers ? book.covers[0] : null;
        console.log(title);
        console.log(note);
        console.log(rating);
        const author = "Unknown";
        const checkBook = await db.query(
            "SELECT id FROM books WHERE work_id=$1", [workId]
        )
        let bookId;
        if (checkBook.rows.length > 0) {
            bookId = checkBook.rows[0].id;
        } else {
            const newBook = await db.query(
                `INSERT INTO books(work_id, title, author, cover_id)
         VALUES($1, $2, $3, $4)
         RETURNING id`,
                [
                    workId,
                    title,
                    author,
                    coverId
                ]
            );

            bookId = newBook.rows[0].id;

        }

        await db.query(
            `INSERT INTO notes(book_id, note, rating)
     VALUES($1, $2, $3)`,
            [
                bookId,
                note,
                rating
            ]
        );

        res.redirect(`/book/${workId}`);

    } catch (err) {

        console.log(err);

    }

});
app.get("/note/edit/:id", async (req, res) => {
    try {
        const noteId = req.params.id;
        const result = await db.query(
            `SELECT
                notes.id,
                notes.note,
                notes.rating,
                books.work_id
             FROM notes
             JOIN books
             ON notes.book_id = books.id
             WHERE notes.id = $1`,
            [noteId]
        );
        if (result.rows.length === 0) {
            return res.send("Note not found.");
        }
        res.render("edit", {
            note: result.rows[0]
        });
    }
    catch (err) {
        console.log(err);
    }

});

app.post("/note/edit/:id", async (req, res) => {
    try {
        const noteId = req.params.id;
        const { note, rating } = req.body;
        await db.query(
            `UPDATE notes
             SET note = $1,
                 rating = $2
             WHERE id = $3`,
            [note, rating, noteId]
        );
        
       const result= await db.query(`SELECT books.work_id
        FROM books
        JOIN notes
        ON books.id = notes.book_id
        WHERE notes.id = $1`, [noteId]);
        const workId = result.rows[0].work_id;
        res.redirect(`/book/${workId}`);
    } catch (err) {
        console.error(err);
    }
}
);

app.post("/note/delete/:id", async (req, res) => {
    try {
        const noteId = req.params.id;
        const result = await db.query(
            `SELECT work_id
             FROM books
             JOIN notes
             ON books.id = notes.book_id
             WHERE notes.id = $1`,
            [noteId]
        );
        console.log("notes id:", noteId);
        const workId = result.rows[0].work_id;


        await db.query(
            "DELETE FROM notes WHERE id = $1",
            [noteId]
        );

        res.redirect(`/book/${workId}`);

    } catch (err) {

        console.log(err);

    }

});




// app.listen(port, () => {
//     console.log(`Server is running on port ${port}`);
// });
export default app;