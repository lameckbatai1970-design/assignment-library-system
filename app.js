// Ekhaya Library Management System - Modular JavaScript

// Data persistence with localStorage
let books = JSON.parse(localStorage.getItem('ekhaya_books')) || [];
let borrowers = JSON.parse(localStorage.getItem('ekhaya_borrowers')) || [];
let members = JSON.parse(localStorage.getItem('ekhaya_members')) || [];
let resources = JSON.parse(localStorage.getItem('ekhaya_resources')) || [];

// Cached metadata for the currently-entered ISBN
let latestFetchedBookMetadata = null;

// Current user role for RBAC
let currentUserRole = null;

// Utility to generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Gamification: badge assignment based on total rentals
function getMemberBadge(rentalCount) {
    if (rentalCount >= 20) return 'Platinum';
    if (rentalCount >= 10) return 'Gold';
    if (rentalCount >= 5) return 'Silver';
    if (rentalCount > 0) return 'Bronze';
    return 'New';
}

// Theme (dark mode) support
function applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        toggle.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
}

function loadTheme() {
    const theme = localStorage.getItem('ekhaya_theme') || 'light';
    applyTheme(theme);
}

function toggleTheme() {
    const current = document.body.classList.contains('dark') ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('ekhaya_theme', next);
    applyTheme(next);
}

// Metadata: book summaries via Open Library
async function fetchBookSummary(book) {
    if (book.summary) return book.summary;
    try {
        let res;
        if (book.isbn) {
            const coverUrl = `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg`;
            book.cover = coverUrl;
            res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${book.isbn}&format=json&jscmd=data`);
            const data = await res.json();
            const key = `ISBN:${book.isbn}`;
            if (data[key] && data[key].notes) {
                return data[key].notes;
            }
        }
        const query = encodeURIComponent(book.title);
        res = await fetch(`https://openlibrary.org/search.json?title=${query}&limit=1`);
        const data = await res.json();
        if (data.docs && data.docs.length > 0) {
            const first = data.docs[0];
            if (!book.cover && first.cover_i) {
                book.cover = `https://covers.openlibrary.org/b/id/${first.cover_i}-M.jpg`;
            }
            if (first.first_sentence) {
                return Array.isArray(first.first_sentence) ? first.first_sentence[0] : first.first_sentence;
            }
            if (first.subtitle) {
                return first.subtitle;
            }
        }
    } catch (err) {
        // ignore failures
    }
    return '';
}

// Smart cataloging: fetch full metadata (title, author, cover, summary) by ISBN
async function fetchBookMetadataByISBN(isbn) {
    const result = { isbn };
    try {
        const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
        const data = await res.json();
        const key = `ISBN:${isbn}`;
        if (data[key]) {
            const bookData = data[key];
            if (bookData.title) result.title = bookData.title;
            if (bookData.authors && bookData.authors.length > 0) result.author = bookData.authors.map(a => a.name).join(', ');
            if (bookData.cover && bookData.cover.medium) result.cover = bookData.cover.medium;
            if (bookData.notes) result.summary = Array.isArray(bookData.notes) ? bookData.notes[0] : bookData.notes;
            if (result.cover && !result.summary) {
                // Ensure we have a cover at least
                result.cover = bookData.cover.medium;
            }
        }
        // If we didn't get core metadata, fall back to search-based summary
        if (!result.title || !result.author || !result.cover || !result.summary) {
            const query = encodeURIComponent(isbn);
            const searchRes = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=1`);
            const searchData = await searchRes.json();
            if (searchData.docs && searchData.docs.length > 0) {
                const first = searchData.docs[0];
                if (!result.title && first.title) result.title = first.title;
                if (!result.author && first.author_name) result.author = first.author_name.join(', ');
                if (!result.cover && first.cover_i) {
                    result.cover = `https://covers.openlibrary.org/b/id/${first.cover_i}-M.jpg`;
                }
                if (!result.summary) {
                    if (first.first_sentence) {
                        result.summary = Array.isArray(first.first_sentence) ? first.first_sentence[0] : first.first_sentence;
                    } else if (first.subtitle) {
                        result.summary = first.subtitle;
                    }
                }
            }
        }
    } catch (err) {
        // ignore failures
    }
    return result;
}

function getAverageRating(book) {
    if (!book.reviews || book.reviews.length === 0) return null;
    const sum = book.reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    return (sum / book.reviews.length).toFixed(1);
}

// Migrate old data if necessary
books = books.map(book => {
    const borrowerCount = borrowers.filter(b => b.bookId === book.id).length;
    return {
        id: book.id || generateId(),
        title: book.title,
        author: book.author,
        isbn: book.isbn || '',
        totalCopies: book.totalCopies || (borrowerCount + 1),
        availableCopies: (book.totalCopies || (borrowerCount + 1)) - borrowerCount,
        status: book.availableCopies > 0 ? 'Available' : 'Out of Stock',
        condition: book.condition || 'New',
        summary: book.summary || '',
        cover: book.cover || '',
        reviews: book.reviews || []
    };
});
resources = resources.map(resource => ({
    id: resource.id || generateId(),
    title: resource.title || '',
    fileName: resource.fileName || '',
    dataUrl: resource.dataUrl || ''
}));
localStorage.setItem('ekhaya_resources', JSON.stringify(resources));
borrowers = borrowers.map(borrower => ({
    id: borrower.id || generateId(),
    name: borrower.name,
    contact: borrower.contact || '',
    bookId: borrower.bookId || null,
    borrowDate: borrower.borrowDate || new Date().toISOString().split('T')[0],
    dueDate: borrower.dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    memberId: borrower.memberId || null,
    returned: borrower.returned || false,
    returnDate: borrower.returnDate || null,
    fine: borrower.fine || 0
}));
if (members.length === 0) {
    // Create members from borrowers
    const memberMap = {};
    borrowers.forEach(borrower => {
        if (!memberMap[borrower.contact]) {
            memberMap[borrower.contact] = {
                id: generateId(),
                name: borrower.name,
                contact: borrower.contact,
                rentals: [],
                badge: 'New'
            };
        }
        memberMap[borrower.contact].rentals.push({
            bookId: borrower.bookId,
            borrowDate: borrower.borrowDate,
            dueDate: borrower.dueDate,
            returnDate: borrower.returnDate,
            fine: borrower.fine
        });
        borrower.memberId = memberMap[borrower.contact].id;
    });
    // Assign badges based on rental history
    Object.values(memberMap).forEach(member => {
        member.badge = getMemberBadge(member.rentals.length);
    });
    members = Object.values(memberMap);
}
localStorage.setItem('ekhaya_books', JSON.stringify(books));
localStorage.setItem('ekhaya_borrowers', JSON.stringify(borrowers));
localStorage.setItem('ekhaya_members', JSON.stringify(members));

// Login functionality
document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    // Role-based authentication
    if (username === 'admin' && password === 'ekhaya2024') {
        currentUserRole = 'Admin';
    } else if (username === 'staff' && password === 'staff2024') {
        currentUserRole = 'Staff';
    } else {
        alert('Invalid credentials. Please try again.');
        return;
    }
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('user-role').textContent = `Logged in as: ${currentUserRole}`;
    // Hide admin-only buttons for Staff
    document.getElementById('export-btn').style.display = currentUserRole === 'Admin' ? '' : 'none';
    loadBooks();
    loadBorrowers();
    loadMembers();
    loadResources();
    updateAnalytics();
    // Voice welcome
    const utterance = new SpeechSynthesisUtterance('Welcome to Ekhaya Library');
    window.speechSynthesis.speak(utterance);
});

// Analytics
function updateAnalytics() {
    const totalBooks = books.reduce((sum, book) => sum + book.totalCopies, 0);
    const checkedOut = books.reduce((sum, book) => sum + (book.totalCopies - book.availableCopies), 0);
    const overdue = borrowers.filter(borrower => new Date(borrower.dueDate) < new Date()).length;
    document.getElementById('total-books').textContent = totalBooks;
    document.getElementById('checked-out').textContent = checkedOut;
    document.getElementById('overdue-count').textContent = overdue;

    const overdueList = borrowers.filter(borrower => new Date(borrower.dueDate) < new Date());
    const listEl = document.getElementById('overdue-list');
    if (overdueList.length > 0) {
        listEl.innerHTML = 'Overdue: ' + overdueList.map(b => `${b.name} (${new Date(b.dueDate).toLocaleDateString()})`).join(', ');
    } else {
        listEl.innerHTML = '';
    }
}

// Book Management Functions
function loadBooks(filter = '') {
    const list = document.getElementById('book-list');
    list.innerHTML = '';
    const filteredBooks = books.filter(book =>
        book.title.toLowerCase().includes(filter.toLowerCase()) ||
        book.isbn.toLowerCase().includes(filter.toLowerCase())
    );
    if (filteredBooks.length === 0) {
        list.innerHTML = '<li class="text-gray-500 italic">No books match the search.</li>';
        return;
    }
    filteredBooks.forEach((book) => {
        const li = document.createElement('li');
        li.className = 'flex flex-col gap-2 p-3 bg-gray-50 rounded border';
        const statusClass = book.availableCopies > 0 ? 'text-green-600' : 'text-red-600';
        const statusText = book.availableCopies > 0 ? 'Available' : 'Out of Stock';
        const avgRating = getAverageRating(book);
        const deleteButton = currentUserRole === 'Admin' ? `<button onclick="deleteBook('${book.id}')" class="text-red-500 hover:text-red-700 font-medium">Delete</button>` : '';
        li.innerHTML = `
            <div class="flex flex-wrap items-center gap-2">
                ${book.cover ? `<img src="${book.cover}" alt="cover" class="w-12 h-16 object-cover rounded" />` : ''}
                <div class="flex-1">
                    <div class="font-medium">${book.title}</div>
                    <div class="text-sm text-gray-600">by ${book.author} (ISBN: ${book.isbn})</div>
                    <div class="text-xs text-gray-500">Available: ${book.availableCopies}/${book.totalCopies} • Condition: ${book.condition}</div>
                </div>
                <div class="text-right">
                    <div class="${statusClass} font-semibold">${statusText}</div>
                    ${avgRating ? `<div class="text-yellow-600 font-semibold text-sm">★ ${avgRating} (${book.reviews.length})</div>` : ''}
                </div>
            </div>
            <div class="text-sm text-gray-600 mt-2">${book.summary ? book.summary.slice(0, 180) + (book.summary.length > 180 ? '...' : '') : 'No summary available.'}</div>
            <div class="flex justify-end mt-2">
                ${deleteButton}
            </div>
        `;
        list.appendChild(li);
        if (!book.summary) {
            // fetch metadata in the background
            fetchBookSummary(book).then(summary => {
                if (summary) {
                    book.summary = summary;
                    localStorage.setItem('ekhaya_books', JSON.stringify(books));
                    li.querySelector('div.text-sm').textContent = summary.slice(0, 180) + (summary.length > 180 ? '...' : '');
                }
            });
        }
    });
}

document.getElementById('book-search').addEventListener('input', function() {
    loadBooks(this.value);
});

document.getElementById('fetch-details').addEventListener('click', async function() {
    const isbn = document.getElementById('book-isbn').value.trim();
    if (!isbn) {
        alert('Please enter an ISBN to fetch details.');
        return;
    }
    const metadata = await fetchBookMetadataByISBN(isbn);
    latestFetchedBookMetadata = metadata;

    if (metadata.title) {
        document.getElementById('book-title').value = metadata.title;
    }
    if (metadata.author) {
        document.getElementById('book-author').value = metadata.author;
    }
    const preview = document.getElementById('cover-preview');
    if (metadata.cover) {
        preview.innerHTML = `<img src="${metadata.cover}" alt="Cover" class="w-20 h-24 object-cover rounded" />`;
    } else {
        preview.innerHTML = '';
    }
});

document.getElementById('add-book-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const title = document.getElementById('book-title').value.trim();
    const author = document.getElementById('book-author').value.trim();
    const isbn = document.getElementById('book-isbn').value.trim();
    const totalCopies = parseInt(document.getElementById('book-copies').value);
    if (title && author && isbn && totalCopies > 0) {
        const metadata = latestFetchedBookMetadata && latestFetchedBookMetadata.isbn === isbn ? latestFetchedBookMetadata : null;
        const newBook = {
            id: generateId(),
            title,
            author,
            isbn,
            totalCopies,
            availableCopies: totalCopies,
            status: 'Available',
            condition: 'New',
            summary: metadata?.summary || '',
            cover: metadata?.cover || '',
            reviews: []
        };
        books.push(newBook);
        localStorage.setItem('ekhaya_books', JSON.stringify(books));
        loadBooks();
        updateAnalytics();
        // Keep metadata updated in case summary is missing
        fetchBookSummary(newBook).then(summary => {
            if (summary) {
                newBook.summary = summary;
                localStorage.setItem('ekhaya_books', JSON.stringify(books));
                loadBooks();
            }
        });
        this.reset();
        document.getElementById('cover-preview').innerHTML = '';
        latestFetchedBookMetadata = null;
    }
});

function deleteBook(id) {
    if (currentUserRole !== 'Admin') {
        alert('Unauthorized: Only Admins can delete books.');
        return;
    }
    if (confirm('Are you sure you want to delete this book?')) {
        books = books.filter(book => book.id !== id);
        borrowers = borrowers.filter(borrower => borrower.bookId !== id); // Remove associated borrowers
        members.forEach(member => {
            member.rentals = member.rentals.filter(rental => rental.bookId !== id);
        });
        localStorage.setItem('ekhaya_books', JSON.stringify(books));
        localStorage.setItem('ekhaya_borrowers', JSON.stringify(borrowers));
        localStorage.setItem('ekhaya_members', JSON.stringify(members));
        loadBooks();
        loadBorrowers();
        loadMembers();
        updateAnalytics();
    }
}

// Borrower Tracking Functions
function loadBorrowers() {
    const list = document.getElementById('borrower-list');
    list.innerHTML = '';
    const activeBorrowers = borrowers.filter(b => !b.returned);
    if (activeBorrowers.length === 0) {
        list.innerHTML = '<li class="text-gray-500 italic">No active borrowers.</li>';
        return;
    }
    activeBorrowers.forEach((borrower) => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center p-3 bg-gray-50 rounded border';
        const book = books.find(b => b.id === borrower.bookId);
        const bookTitle = book ? book.title : 'Unknown Book';
        const dueDate = new Date(borrower.dueDate).toLocaleDateString();
        const isOverdue = new Date(borrower.dueDate) < new Date();
        const daysOverdue = isOverdue ? Math.ceil((new Date() - new Date(borrower.dueDate)) / (1000 * 60 * 60 * 24)) : 0;
        const fine = daysOverdue * 1; // $1 per day
        li.innerHTML = `
            <div>
                <span class="font-medium">${borrower.name}</span> (${borrower.contact}) - ${bookTitle}
                <span class="${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-600'}">Due: ${dueDate}</span>
                ${isOverdue ? `<span class="text-red-600 font-semibold ml-2">Fine: $${fine}</span>` : ''}
            </div>
            <button onclick="returnBook('${borrower.id}')" class="text-red-500 hover:text-red-700 font-medium">Return</button>
        `;
        list.appendChild(li);
    });
}

function populateBookSelect() {
    // No longer needed
}

document.getElementById('add-borrower-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('borrower-name').value.trim();
    const contact = document.getElementById('borrower-contact').value.trim();
    const bookIdentifier = document.getElementById('book-identifier').value.trim();
    const condition = document.getElementById('book-condition').value;
    const dueDate = document.getElementById('due-date').value;
    if (name && contact && bookIdentifier && condition && dueDate) {
        // Find book by title or ID
        let book = books.find(b => b.title.toLowerCase() === bookIdentifier.toLowerCase());
        if (!book) {
            book = books.find(b => b.id === bookIdentifier);
        }
        if (!book || book.availableCopies <= 0) {
            alert('Book not found or out of stock.');
            return;
        }
        // Find or create member
        let member = members.find(m => m.contact === contact);
        if (!member) {
            member = { id: generateId(), name, contact, rentals: [], badge: 'New' };
            members.push(member);
        }
        const borrowDate = new Date().toISOString().split('T')[0];
        const borrowerId = generateId();
        borrowers.push({ id: borrowerId, name, contact, bookId: book.id, borrowDate, dueDate, memberId: member.id, returned: false, returnDate: null, fine: 0 });
        member.rentals.push({ bookId: book.id, borrowDate, dueDate, returnDate: null, fine: 0 });
        member.badge = getMemberBadge(member.rentals.length);
        book.availableCopies--;
        book.status = book.availableCopies > 0 ? 'Available' : 'Out of Stock';
        book.condition = condition;
        localStorage.setItem('ekhaya_books', JSON.stringify(books));
        localStorage.setItem('ekhaya_borrowers', JSON.stringify(borrowers));
        localStorage.setItem('ekhaya_members', JSON.stringify(members));
        loadBooks();
        loadBorrowers();
        loadMembers();
        updateAnalytics();
        this.reset();
    }
});

function returnBook(id) {
    const returnCondition = prompt('Enter the book condition on return (New, Fair, Damaged):');
    if (returnCondition && ['New', 'Fair', 'Damaged'].includes(returnCondition)) {
        const borrower = borrowers.find(b => b.id === id);
        if (borrower) {
            const book = books.find(b => b.id === borrower.bookId);
            if (book) {
                book.availableCopies++;
                book.status = book.availableCopies > 0 ? 'Available' : 'Out of Stock';
                book.condition = returnCondition;
            }
            borrower.returned = true;
            borrower.returnDate = new Date().toISOString().split('T')[0];
            const isOverdue = new Date(borrower.dueDate) < new Date(borrower.returnDate);
            const daysOverdue = isOverdue ? Math.ceil((new Date(borrower.returnDate) - new Date(borrower.dueDate)) / (1000 * 60 * 60 * 24)) : 0;
            borrower.fine = daysOverdue * 1;
            // Add to member's rentals
            const member = members.find(m => m.id === borrower.memberId);
            if (member) {
                member.rentals.push({
                    bookId: borrower.bookId,
                    borrowDate: borrower.borrowDate,
                    dueDate: borrower.dueDate,
                    returnDate: borrower.returnDate,
                    fine: borrower.fine
                });
                member.badge = getMemberBadge(member.rentals.length);
            }

            // Allow borrower to leave a rating + comment
            const rating = parseInt(prompt('Rate the book from 1 (worst) to 5 (best):'), 10);
            const comment = prompt('Leave a short review (optional):');
            if (book && rating && rating >= 1 && rating <= 5) {
                book.reviews = book.reviews || [];
                book.reviews.push({
                    memberId: borrower.memberId,
                    rating,
                    comment: comment || '',
                    date: new Date().toISOString().split('T')[0]
                });
            }

            localStorage.setItem('ekhaya_books', JSON.stringify(books));
            localStorage.setItem('ekhaya_borrowers', JSON.stringify(borrowers));
            localStorage.setItem('ekhaya_members', JSON.stringify(members));
            loadBooks();
            loadBorrowers();
            loadMembers();
            updateAnalytics();
        }
    } else {
        alert('Invalid condition. Please enter New, Fair, or Damaged.');
    }
}

// Member Management Functions
function loadMembers() {
    const list = document.getElementById('member-list');
    list.innerHTML = '';
    if (members.length === 0) {
        list.innerHTML = '<li class="text-gray-500 italic">No members yet.</li>';
        loadLeaderboard();
        return;
    }
    members.forEach((member) => {
        member.badge = getMemberBadge(member.rentals.length);
        const li = document.createElement('li');
        li.className = 'p-3 bg-gray-50 rounded border';
        let rentalsHtml = '<ul class="mt-2 space-y-1">';
        member.rentals.forEach(rental => {
            const book = books.find(b => b.id === rental.bookId);
            const bookTitle = book ? book.title : 'Unknown Book';
            rentalsHtml += `<li class="text-sm">${bookTitle} - Borrowed: ${new Date(rental.borrowDate).toLocaleDateString()} - Returned: ${rental.returnDate ? new Date(rental.returnDate).toLocaleDateString() : 'Not returned'} - Fine: $${rental.fine}</li>`;
        });
        rentalsHtml += '</ul>';
        li.innerHTML = `
            <div class="font-medium">${member.name} (${member.contact}) - Member ID: ${member.id} <span class="ml-2 px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">${member.badge}</span></div>
            <div class="text-sm text-gray-600">Rental History:</div>
            ${rentalsHtml}
        `;
        list.appendChild(li);
    });
    loadLeaderboard();
    loadResources();
}

function loadResources() {
    const list = document.getElementById('resource-list');
    list.innerHTML = '';
    if (resources.length === 0) {
        list.innerHTML = '<li class="text-gray-500 italic">No digital resources uploaded yet.</li>';
        return;
    }
    resources.forEach(resource => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center p-3 bg-gray-50 rounded border';
        const deleteButton = currentUserRole === 'Admin' ? `<button onclick="deleteResource('${resource.id}')" class="text-red-500 hover:text-red-700 text-sm">Delete</button>` : '';
        li.innerHTML = `
            <div>
                <div class="font-medium">${resource.title}</div>
                <div class="text-xs text-gray-600">${resource.fileName}</div>
            </div>
            <div class="flex items-center gap-2">
                <a href="${resource.dataUrl}" target="_blank" class="text-blue-600 hover:underline text-sm">View</a>
                <a href="${resource.dataUrl}" download="${resource.fileName}" class="text-blue-600 hover:underline text-sm">Download</a>
                ${deleteButton}
            </div>
        `;
        list.appendChild(li);
    });
}

function deleteResource(id) {
    if (currentUserRole !== 'Admin') {
        alert('Unauthorized: Only Admins can delete resources.');
        return;
    }
    if (!confirm('Delete this resource?')) return;
    resources = resources.filter(r => r.id !== id);
    localStorage.setItem('ekhaya_resources', JSON.stringify(resources));
    loadResources();
}

document.getElementById('resource-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const title = document.getElementById('resource-title').value.trim();
    const fileInput = document.getElementById('resource-file');
    if (!title || fileInput.files.length === 0) return;
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(event) {
        const dataUrl = event.target.result;
        const newResource = {
            id: generateId(),
            title,
            fileName: file.name,
            dataUrl
        };
        resources.push(newResource);
        localStorage.setItem('ekhaya_resources', JSON.stringify(resources));
        loadResources();
    };
    reader.readAsDataURL(file);
    this.reset();
});

function loadLeaderboard() {
    const board = document.getElementById('leaderboard');
    board.innerHTML = '';
    if (members.length === 0) {
        board.innerHTML = '<li class="text-gray-500 italic">No readers yet.</li>';
        return;
    }
    const top = [...members].sort((a, b) => b.rentals.length - a.rentals.length).slice(0, 5);
    top.forEach((member, idx) => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center';
        li.innerHTML = `<span>${idx + 1}. ${member.name}</span> <span class="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">${member.rentals.length} rentals</span>`;
        board.appendChild(li);
    });
}

// Export to CSV
function exportToCSV() {
    let csv = 'Books\nID,Title,Author,ISBN,Total Copies,Available Copies,Status,Condition\n';
    books.forEach(book => {
        csv += `${book.id},${book.title},${book.author},${book.isbn},${book.totalCopies},${book.availableCopies},${book.status},${book.condition}\n`;
    });
    csv += '\nBorrowers\nID,Name,Contact,Book ID,Borrow Date,Due Date,Member ID,Returned,Return Date,Fine\n';
    borrowers.forEach(borrower => {
        csv += `${borrower.id},${borrower.name},${borrower.contact},${borrower.bookId},${borrower.borrowDate},${borrower.dueDate},${borrower.memberId},${borrower.returned},${borrower.returnDate},${borrower.fine}\n`;
    });
    csv += '\nMembers\nID,Name,Contact\n';
    members.forEach(member => {
        csv += `${member.id},${member.name},${member.contact}\n`;
        member.rentals.forEach(rental => {
            csv += `,,Rental: Book ID ${rental.bookId},Borrow ${rental.borrowDate},Due ${rental.dueDate},Return ${rental.returnDate},Fine $${rental.fine}\n`;
        });
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ekhaya_library_data.csv';
    a.click();
    URL.revokeObjectURL(url);
}

document.getElementById('export-btn').addEventListener('click', exportToCSV);
document.getElementById('logout-btn').addEventListener('click', logoutUser);
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
document.getElementById('send-reminders').addEventListener('click', sendDueDateReminders);

// Apply saved theme on load
loadTheme();

function logoutUser() {
    currentUserRole = null;
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('user-role').textContent = '';
    document.getElementById('export-btn').style.display = '';
    // Clear the login form so credentials aren't left behind
    document.getElementById('login-form').reset();
}


function sendDueDateReminders() {
    const today = new Date();
    const threshold = new Date();
    threshold.setDate(today.getDate() + 2); // remind for 2 days ahead

    const dueSoon = borrowers
        .filter(b => !b.returned)
        .filter(b => {
            const due = new Date(b.dueDate);
            return due <= threshold;
        })
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    if (dueSoon.length === 0) {
        alert('No borrowers need reminders within the next two days.');
        return;
    }

    const messages = dueSoon.map(b => {
        const dueDate = new Date(b.dueDate).toLocaleDateString();
        return `Reminder: ${b.name} (Contact: ${b.contact}) has a book due on ${dueDate}.`;
    });

    const output = messages.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(output).then(() => {
            alert('Reminders copied to clipboard. You can paste them into your email or messaging app.');
        }).catch(() => {
            alert(output);
        });
    } else {
        alert(output);
    }
}