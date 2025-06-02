import * as Sentry from "@sentry/browser";

// Initialize Sentry as early as possible
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENVIRONMENT || process.env.NODE_ENV || "development",
    integrations: [
      // Add any browser-specific integrations here if needed in the future
      // e.g., new Sentry.BrowserProfilingIntegration(), new Sentry.BrowserTracing()
    ],
    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
    // Set profilesSampleRate to 1.0 to profile 100%
    // of sampled transactions.
    // We recommend adjusting this value in production
    profilesSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0, // If you want to replay errors
    replaysSessionSampleRate: 0.1, // If you want to replay some sessions
  });
  console.log('Sentry initialized for frontend with DSN:', process.env.SENTRY_DSN, 'Env:', process.env.ENVIRONMENT);
} else {
  console.log('Sentry DSN not found, Sentry not initialized for frontend.');
}

// Web Vitals Logging
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';

function logWebVital({ name, value, rating }) {
  console.log(`Web Vitals - ${name}: ${value} (${rating})`);
  // Example: Send to Sentry as custom measurement or tag (optional)
  // if (Sentry && Sentry.getCurrentHub && Sentry.getCurrentHub().getClient()) {
  //   Sentry.setMeasurement(name, value, "millisecond");
  // }
}

onCLS(logWebVital);
onINP(logWebVital); // Replaced getFID with onINP
onLCP(logWebVital);
onFCP(logWebVital); // First Contentful Paint
onTTFB(logWebVital); // Time to First Byte

// Frontend JavaScript for Todo App

document.addEventListener('DOMContentLoaded', () => {
    console.log('Todo App Frontend Initialized');

    // Globals
    const API_BASE_URL = 'http://localhost:8000/api'; // Adjust if your backend runs elsewhere
    let accessToken = localStorage.getItem('accessToken');
    let refreshToken = localStorage.getItem('refreshToken');

    // UI Elements
    const authContainer = document.querySelector('.container.py-5'); // New main auth section wrapper
    const appDiv = document.getElementById('app');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const logoutButton = document.getElementById('logout-button');
    const loggedInUsernameSpan = document.getElementById('logged-in-username');
    
    const todoForm = document.getElementById('todo-form'); // New form ID for adding todos
    const todoInput = document.getElementById('todo-input'); // New input field for todo title
    const dueDateInput = document.getElementById('due-date'); // New due date input
    const prioritySelect = document.getElementById('priority-select'); // New priority select for adding todos

    const todoListUl = document.getElementById('todo-list');
    const searchInput = document.getElementById('search-input');
    const statusFilterSelect = document.getElementById('status-filter'); // New ID for status filter
    const priorityFilterSelect = document.getElementById('priority-filter'); // New ID for priority filter
    const paginationDiv = document.getElementById('pagination');
    const clearCompletedButton = document.getElementById('clear-completed-button');
    const noTodosMessage = document.getElementById('no-todos-message');

    // Edit Modal Elements
    const editModalEl = document.getElementById('editModal');
    let editModalInstance = null; // To store the Bootstrap Modal instance
    if (editModalEl) {
        editModalInstance = new bootstrap.Modal(editModalEl);
    }
    const editTodoForm = document.getElementById('edit-todo-form');
    const editTodoIdInput = document.getElementById('edit-todo-id');
    const editTodoTitleInput = document.getElementById('edit-todo-title');
    const editDueDateInput = document.getElementById('edit-due-date');
    const editPrioritySelect = document.getElementById('edit-priority-select');
    const editTodoCompletedCheckbox = document.getElementById('edit-todo-completed');
    const saveEditBtn = document.getElementById('save-edit-btn');

    // State
    let todos = [];
    let currentPage = 1;
    let currentFilters = {
        search: '',
        status: 'all',
        priority: 'all'
    };

    // --- Filter Persistence Functions ---
    function saveFilters() {
        localStorage.setItem('todoFilters', JSON.stringify(currentFilters));
    }

    function loadFilters() {
        const savedFilters = localStorage.getItem('todoFilters');
        if (savedFilters) {
            try {
                const parsedFilters = JSON.parse(savedFilters);
                currentFilters = { ...currentFilters, ...parsedFilters }; // Merge, allowing defaults

                // Update UI elements to reflect loaded filters
                if (searchInput && currentFilters.search) {
                    searchInput.value = currentFilters.search;
                }
                if (statusFilterSelect && currentFilters.status) {
                    statusFilterSelect.value = currentFilters.status;
                }
                if (priorityFilterSelect && currentFilters.priority) {
                    priorityFilterSelect.value = currentFilters.priority;
                }
            } catch (e) {
                console.error("Error parsing saved filters from localStorage:", e);
                localStorage.removeItem('todoFilters'); // Clear corrupted data
            }
        }
    }

    // Initialize SortableJS for the todo list
    let sortableInstance = null;
    function initSortable() {
        if (todoListUl && typeof Sortable !== 'undefined') {
            sortableInstance = new Sortable(todoListUl, {
                animation: 150,
                ghostClass: 'sortable-ghost', // Class for the drop placeholder
                onEnd: async (event) => {
                    // Get the new order of todo IDs
                    const reorderedIds = Array.from(todoListUl.children).map(item => item.dataset.id);
                    console.log('Reordered IDs:', reorderedIds);

                    try {
                        const response = await apiRequest('/todos/reorder/', 'POST', { order: reorderedIds });
                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ detail: 'Failed to reorder todos.' }));
                            alert(`Error reordering todos: ${errorData.detail || response.statusText}`);
                            // Optionally, revert UI changes or re-fetch to correct order
                            fetchTodos(currentPage); // Re-fetch to ensure UI consistency on error
                        } else {
                            console.log('Todos reordered successfully on backend.');
                            // The backend has updated the order. To reflect this in our local `todos` array
                            // without a full re-fetch, we can re-order the `todos` array manually based on `reorderedIds`.
                            // However, for simplicity and to ensure data consistency, a re-fetch is often safer unless performance is critical.
                            // For now, we rely on the backend to save and then we re-render based on fetched order.
                            // To make the UI feel snappier, you could update the local `todos` array order immediately
                            // and then trust the backend call succeeds, or revert if it fails.
                            // Let's update the local `todos` array to match the new visual order for immediate UI feedback,
                            // assuming backend will reflect this on next fetch.
                            const newSortedTodos = [];
                            const todoMap = new Map(todos.map(t => [String(t.id), t]));
                            reorderedIds.forEach(id => {
                                if (todoMap.has(id)) {
                                    newSortedTodos.push(todoMap.get(id));
                                }
                            });
                            todos = newSortedTodos;
                            // No need to call renderTodos() here if SortableJS already updated the DOM visually,
                            // but we need to ensure our internal `todos` array reflects the new order for subsequent operations.
                        }
                    } catch (error) {
                        console.error('Reorder API call error:', error);
                        alert('An error occurred while reordering todos. Please try again.');
                        fetchTodos(currentPage); // Re-fetch to ensure UI consistency
                    }
                }
            });
        } else if (typeof Sortable === 'undefined') {
            console.warn('SortableJS is not loaded. Drag-and-drop will not be available.');
        }
    }

    // Initially check login state
    checkLoginState();

    // --- Helper to update username display ---
    function updateLoggedInUserDisplay(username) {
        if (username) {
            loggedInUsernameSpan.textContent = username;
        } else {
            // Try to decode from token if available (basic example, no library used for simplicity)
            // In a real app, use a library like jwt-decode or get user info from a /me endpoint
            if (accessToken) {
                try {
                    const payload = JSON.parse(atob(accessToken.split('.')[1]));
                    loggedInUsernameSpan.textContent = payload.username || 'User';
                } catch (e) {
                    console.error("Error decoding token for username:", e);
                    loggedInUsernameSpan.textContent = 'User';
                }
            } else {
                loggedInUsernameSpan.textContent = 'User';
            }
        }
    }

    // --- Authentication Functions ---
    function checkLoginState() {
        if (accessToken) {
            showAppView();
            updateLoggedInUserDisplay(); // Update username display
            loadFilters(); // Load filters after showing app view so elements are visible
            fetchTodos(); 
            initSortable(); // Initialize sortable after app view is shown and list element exists
        } else {
            showAuthView();
        }
    }

    function showAuthView() {
        if (authContainer) authContainer.classList.remove('d-none'); // New
        appDiv.classList.add('d-none'); // Changed from 'hidden'
    }

    function showAppView() {
        if (authContainer) authContainer.classList.add('d-none'); // New
        appDiv.classList.remove('d-none'); // Changed from 'hidden'
    }

    // --- Event Listeners ---
    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;

            try {
                const response = await apiRequest('/token/', 'POST', { username, password }, false); // No auth for login
                
                if (response.ok) {
                    const data = await response.json();
                    accessToken = data.access;
                    refreshToken = data.refresh;
                    localStorage.setItem('accessToken', accessToken);
                    localStorage.setItem('refreshToken', refreshToken);
                    
                    updateLoggedInUserDisplay(username); // Use the username from form
                    showAppView();
                    fetchTodos(); // Fetch todos for the logged-in user
                    loginForm.reset();
                } else {
                    const errorData = await response.json().catch(() => ({ detail: 'Login failed. Please check your credentials.' }));
                    alert(`Login Failed: ${errorData.detail || response.statusText}`);
                }
            } catch (error) {
                console.error('Login error:', error);
                alert('An error occurred during login. Please try again.');
            }
        });
    }

    if(registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('register-username').value;
            const password = document.getElementById('register-password').value;
            const email = document.getElementById('register-email').value;
            const confirmPassword = document.getElementById('register-confirm-password').value;

            if (password !== confirmPassword) {
                alert("Passwords do not match.");
                return;
            }

            const registrationData = {
                username,
                password,
                email,
            };
            // Remove undefined keys
            Object.keys(registrationData).forEach(key => registrationData[key] === undefined && delete registrationData[key]);


            try {
                const response = await apiRequest('/users/register/', 'POST', registrationData, false); // No auth for register

                if (response.ok) {
                    alert('Registration successful! Please log in.');
                    registerForm.reset();
                    // Optionally, switch to login form or auto-login
                } else {
                    const errorData = await response.json();
                    let errorMessage = 'Registration failed:\\n';
                    for (const field in errorData) {
                        errorMessage += `${field}: ${errorData[field].join(', ')}\\n`;
                    }
                    alert(errorMessage);
                }
            } catch (error) {
                console.error('Registration error:', error);
                alert('An error occurred during registration. Please try again.');
            }
        });
    }

    if(logoutButton) {
        logoutButton.addEventListener('click', () => {
            // Logout logic will go here
            console.log('Logout button clicked');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            accessToken = null;
            refreshToken = null;
            todos = [];
            showAuthView();
        });
    }

    // Add Todo Form event listener (updated for new IDs)
    if (todoForm) {
        todoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = todoInput.value.trim();
            const dueDate = dueDateInput.value || null; // Optional
            const priority = prioritySelect.value;

            if (!title) {
                alert('Please enter a todo title.');
                return;
            }

            try {
                const response = await apiRequest('/todos/', 'POST', { 
                    title, 
                    due_date: dueDate, 
                    priority 
                });
                if (response.ok) {
                    fetchTodos(currentPage); // Refresh list
                    todoForm.reset(); // Reset form fields
                } else {
                    const errorData = await response.json().catch(() => ({ detail: 'Failed to add todo.' }));
                    alert(`Error adding todo: ${errorData.detail || response.statusText}`);
                }
            } catch (error) {
                console.error('Add todo error:', error);
                Sentry.captureException(error);
                alert('An error occurred while adding the todo.');
            }
        });
    }

    // Search and Filter event listeners
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentFilters.search = searchInput.value;
            saveFilters();
            fetchTodos(); // Debounce this in a real app
        });
    }
    if (statusFilterSelect) {
        statusFilterSelect.addEventListener('change', () => {
            currentFilters.status = statusFilterSelect.value;
            saveFilters();
            fetchTodos();
        });
    }
    if (priorityFilterSelect) {
        priorityFilterSelect.addEventListener('change', () => {
            currentFilters.priority = priorityFilterSelect.value;
            saveFilters();
            fetchTodos();
        });
    }
    
    if (clearCompletedButton) {
        clearCompletedButton.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to delete all completed todos?")) {
                return;
            }
            try {
                const response = await apiRequest('/todos/clear_completed/', 'POST');
                if (response.ok) {
                    fetchTodos(currentPage); // Refresh list
                } else {
                    const errorData = await response.json().catch(() => ({ detail: 'Failed to clear completed todos.' }));
                    alert(`Error clearing completed todos: ${errorData.detail || response.statusText}`);
                }
            } catch (error) {
                console.error('Clear completed todos error:', error);
                Sentry.captureException(error);
                alert('An error occurred while clearing completed todos.');
            }
        });
    }

    // --- API Helper ---
    async function apiRequest(endpoint, method = 'GET', body = null, includeAuth = true) {
        const headers = { 'Content-Type': 'application/json' };
        if (includeAuth && accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }

        const config = {
            method,
            headers
        };

        if (body) {
            config.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
            
            if (response.status === 401 && includeAuth) {
                // Access token might have expired, try to refresh it
                const refreshed = await refreshTokenAndRetry(endpoint, method, body);
                if (refreshed) return refreshed; // Return the response from the retried request
                // If refresh failed, logout user
                handleLogout(); 
                throw new Error('Authentication failed, please log in again.');
            }
            return response;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    async function refreshTokenAndRetry(originalEndpoint, originalMethod, originalBody) {
        if (!refreshToken) return null;

        try {
            const refreshResponse = await fetch(`${API_BASE_URL}/token/refresh/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh: refreshToken })
            });

            if (!refreshResponse.ok) {
                console.error('Failed to refresh token');
                return null;
            }

            const data = await refreshResponse.json();
            accessToken = data.access;
            localStorage.setItem('accessToken', accessToken);
            console.log('Token refreshed successfully');

            // Retry the original request with the new token
            return await apiRequest(originalEndpoint, originalMethod, originalBody, true);
        } catch (error) {
            console.error('Error refreshing token:', error);
            return null;
        }
    }
    
    function handleLogout() {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        accessToken = null;
        refreshToken = null;
        todos = [];
        showAuthView();
    }

    // --- Todo Functions (to be implemented based on Step 7 of SPECIFICATIONS) ---
    async function fetchTodos(page = 1) {
        if (!accessToken) return;
        currentPage = page;
        let queryParams = `?page=${currentPage}`;
        if (currentFilters.search) queryParams += `&search=${encodeURIComponent(currentFilters.search)}`;
        if (currentFilters.status !== 'all') queryParams += `&status=${currentFilters.status}`;
        if (currentFilters.priority !== 'all') queryParams += `&priority=${currentFilters.priority}`;
        
        console.log(`Fetching todos with params: ${API_BASE_URL}/todos/${queryParams}`);
        try {
            const response = await apiRequest(`/todos/${queryParams}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch todos' }));
                throw new Error(errorData.detail || 'Failed to fetch todos');
            }
            const data = await response.json();
            todos = data.results; // Assuming pagination from DRF
            renderTodos();
            renderPagination(data); // data should include count, next, previous
        } catch (error) {
            console.error('Error fetching todos:', error);
            alert(error.message);
            // If auth error, handleLogout might already be called by apiRequest
        }
    }

    // --- Render Functions ---
    // function renderTodos() { // OLD RENDER TODOS FUNCTION - TO BE REPLACED
    //     todoListUl.innerHTML = ''; // Clear existing todos
    // ... (old content of renderTodos) ...
    // }

    // Helper functions for priority display (NEW)
    function getPriorityLabel(priority) {
        const labels = {'U': 'Urgent', 'H': 'High', 'M': 'Medium', 'L': 'Low'};
        return labels[priority] || priority;
    }

    function getPriorityIcon(priority) {
        const icons = {'U': 'bi-exclamation-triangle', 'H': 'bi-exclamation-circle', 'M': 'bi-arrow-right', 'L': 'bi-arrow-down'};
        return icons[priority] || 'bi-question-circle';
    }

    function getPriorityBadgeClass(priority) {
        const classes = {'U': 'bg-danger', 'H': 'bg-warning text-dark', 'M': 'bg-info', 'L': 'bg-success'};
        return classes[priority] || 'bg-secondary';
    }

    // In app.js - update renderTodos function (NEW)
    function renderTodos() { // Parameter `todos` removed, will use global `todos` array
        todoListUl.innerHTML = ''; // Corrected from todoList to todoListUl
        
        if (!todos || todos.length === 0) {
            if (noTodosMessage) noTodosMessage.classList.remove('d-none');
            if (paginationDiv) paginationDiv.classList.add('d-none'); 
            return;
        }
        if (noTodosMessage) noTodosMessage.classList.add('d-none');
        if (paginationDiv && todos.length > 0) paginationDiv.classList.remove('d-none');

        todos.forEach(todo => {
            const todoDate = todo.due_date ? new Date(todo.due_date) : null;
            const formattedDate = todoDate ? 
            todoDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
            
            const li = document.createElement('li');
            li.className = `list-group-item d-flex justify-content-between align-items-center todo-card priority-${todo.priority || 'M'}`;
            if (todo.completed) {
                li.classList.add('completed', 'bg-light');
            }
            li.dataset.id = todo.id;
            
            li.innerHTML = `
            <div class="d-flex align-items-center flex-grow-1">
                <div class="form-check">
                <input class="form-check-input" type="checkbox" ${todo.completed ? 'checked' : ''} id="todo-check-${todo.id}" title="${todo.completed ? 'Mark Incomplete' : 'Mark Complete'}">
                </div>
                <div class="ms-3 flex-grow-1">
                <label class="todo-title ${todo.completed ? 'text-muted text-decoration-line-through' : ''}" for="todo-check-${todo.id}" style="cursor: pointer;">
                    ${todo.title}
                </label>
                <div class="mt-1 small">
                    ${formattedDate ? `<span class="badge bg-light text-dark border me-2"><i class="bi bi-calendar3 me-1"></i>${formattedDate}</span>` : ''}
                    <span class="badge ${getPriorityBadgeClass(todo.priority || 'M')}">
                    <i class="bi ${getPriorityIcon(todo.priority || 'M')} me-1"></i>${getPriorityLabel(todo.priority || 'M')}
                    </span>
                </div>
                </div>
            </div>
            <div class="todo-actions ms-2">
                <button class="btn btn-sm btn-outline-primary edit-btn me-1" title="Edit Todo">
                <i class="bi bi-pencil-square"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger delete-btn" title="Delete Todo">
                <i class="bi bi-trash3-fill"></i>
                </button>
            </div>
            `;
            
            // Add event listeners
            li.querySelector('.form-check-input').addEventListener('change', async () => {
                await handleToggleComplete(todo.id, todo.completed); // Made async and awaited
            });
            
            li.querySelector('.delete-btn').addEventListener('click', async () => {
                await handleDeleteTodo(todo.id); // Made async and awaited
                // li.remove(); // Removed, as fetchTodos will re-render
            });
            
            li.querySelector('.edit-btn').addEventListener('click', () => {
                showEditModal(todo);
            });
            
            todoListUl.appendChild(li); // Corrected from todoList to todoListUl
        });
    }

    function renderPagination(data) {
        paginationDiv.innerHTML = ''; // Clear existing pagination
        if (!data.totalPages || data.totalPages <= 1) {
            return; // No pagination needed for 0 or 1 page
        }

        const ul = document.createElement('ul');
        ul.className = 'pagination justify-content-center'; // Bootstrap classes already in HTML, but good to ensure

        // Previous Button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${!data.hasPrev ? 'disabled' : ''}`;
        const prevLink = document.createElement('a');
        prevLink.className = 'page-link';
        prevLink.href = '#';
        prevLink.innerHTML = '&laquo; <span class="d-none d-md-inline">Previous</span>';
        prevLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (data.hasPrev) fetchTodos(data.currentPage - 1);
        });
        prevLi.appendChild(prevLink);
        ul.appendChild(prevLi);

        // Page Number Buttons (simplified logic for brevity)
        // In a real app, you might want more complex logic for many pages (e.g., ellipsis)
        const maxPagesToShow = 5;
        let startPage = Math.max(1, data.currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(data.totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }
        
        if (startPage > 1) {
            const firstLi = document.createElement('li');
            firstLi.className = 'page-item';
            const firstLink = document.createElement('a');
            firstLink.className = 'page-link';
            firstLink.href = '#';
            firstLink.textContent = '1';
            firstLink.addEventListener('click', (e) => { e.preventDefault(); fetchTodos(1); });
            firstLi.appendChild(firstLink);
            ul.appendChild(firstLi);
            if (startPage > 2) {
                const ellipsisLi = document.createElement('li');
                ellipsisLi.className = 'page-item disabled';
                ellipsisLi.innerHTML = '<span class="page-link">...</span>';
                ul.appendChild(ellipsisLi);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageLi = document.createElement('li');
            pageLi.className = `page-item ${i === data.currentPage ? 'active' : ''}`;
            const pageLink = document.createElement('a');
            pageLink.className = 'page-link';
            pageLink.href = '#';
            pageLink.textContent = i;
            if (i !== data.currentPage) {
                pageLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    fetchTodos(i);
                });
            }
            pageLi.appendChild(pageLink);
            ul.appendChild(pageLi);
        }
        
        if (endPage < data.totalPages) {
            if (endPage < data.totalPages - 1) {
                const ellipsisLi = document.createElement('li');
                ellipsisLi.className = 'page-item disabled';
                ellipsisLi.innerHTML = '<span class="page-link">...</span>';
                ul.appendChild(ellipsisLi);
            }
            const lastLi = document.createElement('li');
            lastLi.className = 'page-item';
            const lastLink = document.createElement('a');
            lastLink.className = 'page-link';
            lastLink.href = '#';
            lastLink.textContent = data.totalPages;
            lastLink.addEventListener('click', (e) => { e.preventDefault(); fetchTodos(data.totalPages); });
            lastLi.appendChild(lastLink);
            ul.appendChild(lastLi);
        }

        // Next Button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${!data.hasNext ? 'disabled' : ''}`;
        const nextLink = document.createElement('a');
        nextLink.className = 'page-link';
        nextLink.href = '#';
        nextLink.innerHTML = '<span class="d-none d-md-inline">Next</span> &raquo;';
        nextLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (data.hasNext) fetchTodos(data.currentPage + 1);
        });
        nextLi.appendChild(nextLink);
        ul.appendChild(nextLi);

        paginationDiv.appendChild(ul);
    }

    // --- Placeholder functions for Edit/Delete/Toggle ---
    async function handleToggleComplete(todoId, currentStatus) {
        console.log(`Toggle complete for todo ${todoId}, current status: ${currentStatus}`);
        try {
            const response = await apiRequest(`/todos/${todoId}/`, 'PATCH', { completed: !currentStatus });
            if (response.ok) {
                // Find the todo in the local array and update its status for immediate UI feedback before re-fetch
                const todoIndex = todos.findIndex(t => t.id === todoId);
                if (todoIndex !== -1) {
                    todos[todoIndex].completed = !currentStatus;
                }
                fetchTodos(currentPage); // Re-fetch to ensure consistency and get ordered list
            } else {
                alert('Failed to update todo status.');
            }
        } catch (error) {
            console.error('Error toggling todo status:', error);
            Sentry.captureException(error);
            alert('Error toggling todo status.');
        }
    }

    async function handleDeleteTodo(todoId) {
        console.log(`Delete todo ${todoId}`);
        if (!confirm('Are you sure you want to delete this todo?')) return;
        try {
            const response = await apiRequest(`/todos/${todoId}/`, 'DELETE');
            if (response.ok || response.status === 204) { // 204 No Content is also a success
                fetchTodos(); // Refresh, potentially to page 1 or current if not empty
            } else {
                 alert('Failed to delete todo.');
            }
        } catch (error) {
            console.error('Error deleting todo:', error);
            Sentry.captureException(error);
            alert('Error deleting todo.');
        }
    }

    // Updated showEditModal function
    function showEditModal(todo) {
        const modalEl = document.getElementById('editModal');
        if (!modalEl || !todo) return;

        // Ensure a modal instance is created. If you prefer to create it once and reuse,
        // that logic would be outside this function, similar to editModalInstance.
        // For this snippet, we create it on each call as per user's direct code.
        const modal = new bootstrap.Modal(modalEl);

        document.getElementById('edit-todo-id').value = todo.id;
        document.getElementById('edit-todo-title').value = todo.title;
        
        // Use existing logic for robust due_date formatting for datetime-local
        const editDueDateInput = document.getElementById('edit-due-date');
        if (todo.due_date) {
            const d = new Date(todo.due_date);
            // Format for datetime-local input: YYYY-MM-DDTHH:mm
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            editDueDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        } else {
            editDueDateInput.value = ''; // Clear if no due date
        }
        
        document.getElementById('edit-priority-select').value = todo.priority || 'M';
        document.getElementById('edit-todo-completed').checked = todo.completed;

        // Set onclick handler for the save button
        document.getElementById('save-edit-btn').onclick = async () => {
            const id = document.getElementById('edit-todo-id').value;
            const title = document.getElementById('edit-todo-title').value.trim();
            const dueDate = document.getElementById('edit-due-date').value || null;
            const priority = document.getElementById('edit-priority-select').value;
            const completed = document.getElementById('edit-todo-completed').checked;

            if (!title) {
                alert('Task title cannot be empty.');
                return;
            }

            await updateTodo(id, { 
                title, 
                due_date: dueDate, 
                priority, 
                completed 
            });
            
            modal.hide(); // Hide the modal after saving
        };
        
        modal.show();
    }

    async function updateTodo(todoId, updateData) {
        try {
            const response = await apiRequest(`/todos/${todoId}/`, 'PATCH', updateData);
            if (response.ok) {
                fetchTodos(currentPage);
            } else {
                const errorData = await response.json().catch(() => ({ detail: 'Failed to update todo.' }));
                alert(`Error updating todo: ${errorData.detail || JSON.stringify(errorData)}`);
            }
        } catch (error) {
            console.error('Update todo error:', error);
            alert('An error occurred while updating the todo.');
        }
    }

    // Call initial fetch if logged in
    if (accessToken) {
        fetchTodos();
    }
}); 