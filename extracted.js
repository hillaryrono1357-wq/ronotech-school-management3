

        // CENTRAL LAN DATABASE ADAPTER + SESSION AUTHENTICATION
        let SESSION_TOKEN = sessionStorage.getItem('rono_school_session') || '';
        let CURRENT_USER = null;
        const schoolStorage = {
            getItem(key) {
                try {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', '/api/state?key=' + encodeURIComponent(key), false);
                    if (SESSION_TOKEN) xhr.setRequestHeader('x-session-token', SESSION_TOKEN);
                    xhr.send();
                    if (xhr.status === 401) { forceLogin(); return null; }
                    if (xhr.status === 200) { const payload = JSON.parse(xhr.responseText); return payload.value ?? null; }
                } catch (e) { console.error('Unable to load shared school database:', e); }
                return null;
            },
            setItem(key, value) {
                try {
                    const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/state', false);
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    if (SESSION_TOKEN) xhr.setRequestHeader('x-session-token', SESSION_TOKEN);
                    xhr.send(JSON.stringify({ key, value }));
                    if (xhr.status === 401) forceLogin();
                    if (xhr.status < 200 || xhr.status >= 300) console.error('Unable to save shared school database:', xhr.responseText);
                } catch (e) { console.error('Unable to save shared school database:', e); }
            },
            removeItem(key) {
                try {
                    const xhr = new XMLHttpRequest(); xhr.open('DELETE', '/api/state?key=' + encodeURIComponent(key), false);
                    if (SESSION_TOKEN) xhr.setRequestHeader('x-session-token', SESSION_TOKEN);
                    xhr.send();
                    if (xhr.status === 401) forceLogin();
                } catch (e) { console.error('Unable to clear shared school database:', e); }
            }
        };

        const SCHOOL_NAME = 'MABASI COMPREHENSIVE SCHOOL'; 
        const DB_KEY = 'SMS_V4_DATABASE'; 
        let SMS_DB = {};
        let currentView = 'dashboard';
        let currentSubView = null; 
        let currentStudentId = null; 
        
        let studentScores = {}; 

        const FINE_RATE_PER_DAY = 50.00; 
        const MAX_LOAN_DAYS = 14;
        
        const GRADING_TERMS = ['Term 1', 'Mid Term 1', 'Term 2', 'Mid Term 2', 'Term 3', 'Mid Term 3'];


        const contentContainer = document.getElementById('content-container');
        const pageTitle = document.getElementById('page-title');
        const sidebar = document.getElementById('sidebar');
        const menuBtn = document.getElementById('menu-btn');
        const loadingOverlay = document.getElementById('loading-overlay');
        const pdfContainer = document.getElementById('pdf-report-container');
        const uploadModal = document.getElementById('upload-modal');
        const exportModal = document.getElementById('export-modal');
        const dailyPaymentsModal = document.getElementById('daily-payments-modal');
        const deleteClassModal = document.getElementById('delete-class-modal'); 
        const financeImportModal = document.getElementById('finance-import-modal'); // New: Finance import modal

        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('-translate-x-full');
        });
        
        function showLoading(show = true) {
            loadingOverlay.classList.toggle('hidden', !show);
        }

        function apiFetch(url, options = {}) {
            options.headers = Object.assign({'Content-Type':'application/json'}, options.headers || {});
            if (SESSION_TOKEN) options.headers['x-session-token'] = SESSION_TOKEN;
            return fetch(url, options).then(async r => { const data = await r.json().catch(()=>({})); if (!r.ok) throw new Error(data.error || 'Request failed'); return data; });
        }

        function openLogin() {
            document.getElementById('auth-modal').classList.remove('hidden');
            document.getElementById('login-username').focus();
        }
        function closeLogin() { document.getElementById('auth-modal').classList.add('hidden'); }
        function forceLogin() { SESSION_TOKEN=''; CURRENT_USER=null; sessionStorage.removeItem('rono_school_session'); document.getElementById('sms-container').classList.add('hidden'); document.getElementById('website-container').classList.remove('hidden'); openLogin(); }
        async function handleLogin(event) {
            event.preventDefault(); const btn=document.getElementById('login-btn'); const err=document.getElementById('login-error'); err.classList.add('hidden'); btn.disabled=true; btn.textContent='Signing in...';
            try {
                const data=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('login-username').value,password:document.getElementById('login-password').value})}).then(async r=>{const d=await r.json(); if(!r.ok) throw new Error(d.error||'Login failed'); return d;});
                SESSION_TOKEN=data.token; CURRENT_USER=data.user; sessionStorage.setItem('rono_school_session',SESSION_TOKEN); closeLogin(); document.getElementById('website-container').classList.add('hidden'); document.getElementById('sms-container').classList.remove('hidden'); updateUserHeader(); applyRoleUI(); loadData(); navigate('dashboard');
            } catch(e) { err.textContent=e.message; err.classList.remove('hidden'); } finally { btn.disabled=false; btn.textContent='Sign In'; }
        }
        async function logoutUser() { try { if(SESSION_TOKEN) await apiFetch('/api/auth/logout',{method:'POST'}); } catch(e) {} SESSION_TOKEN=''; CURRENT_USER=null; sessionStorage.removeItem('rono_school_session'); document.getElementById('sms-container').classList.add('hidden'); document.getElementById('website-container').classList.remove('hidden'); }
        async function restoreSession() {
            if(!SESSION_TOKEN) return false;
            try { const data=await apiFetch('/api/auth/me'); CURRENT_USER=data.user; updateUserHeader(); applyRoleUI(); return true; } catch(e) { SESSION_TOKEN=''; sessionStorage.removeItem('rono_school_session'); return false; }
        }
        function updateUserHeader(){ if(!CURRENT_USER) return; document.getElementById('current-user-name').textContent=CURRENT_USER.full_name; document.getElementById('current-user-role').textContent=CURRENT_USER.roleLabel; }
        function hasSectionAccess(section){ if(!CURRENT_USER) return false; if(CURRENT_USER.role==='admin') return true; if(section==='finance') return CURRENT_USER.role==='finance'; if(section==='library') return CURRENT_USER.role==='librarian'; if(section==='admin') return false; return true; }
        function protectSection(section){ if(hasSectionAccess(section)) return true; alert(section==='finance' ? 'Finance is restricted to the Finance Officer or Administrator.' : section==='library' ? 'Library is restricted to the Librarian or Administrator.' : 'You do not have permission to access this section.'); return false; }
        function applyRoleUI(){
            if(!CURRENT_USER) return;
            const finance=document.getElementById('nav-finance'), library=document.getElementById('nav-library'), admin=document.getElementById('nav-admin');
            if(finance) finance.classList.toggle('hidden', !hasSectionAccess('finance'));
            if(library) library.classList.toggle('hidden', !hasSectionAccess('library'));
            if(admin) admin.classList.toggle('hidden', CURRENT_USER.role!=='admin');
        }

        async function renderAdmin(){
            if(!protectSection('admin')) return;
            contentContainer.innerHTML = `<div class="space-y-6">
                <div class="bg-white rounded-xl shadow p-6 border-l-4 border-blue-700"><h2 class="text-2xl font-bold text-blue-800">Administration</h2><p class="text-gray-600 mt-1">Manage school system users, roles and access to protected departments.</p></div>
                <div class="bg-white rounded-xl shadow p-6">
                    <h3 class="text-xl font-semibold mb-4">Create User</h3>
                    <form onsubmit="createSystemUser(event)" class="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <input id="new-username" required placeholder="Username" class="p-2 border rounded-lg">
                        <input id="new-fullname" required placeholder="Full name" class="p-2 border rounded-lg">
                        <input id="new-password" required type="password" minlength="8" placeholder="Password (8+ chars)" class="p-2 border rounded-lg">
                        <select id="new-role" class="p-2 border rounded-lg"><option value="staff">Staff</option><option value="teacher">Teacher</option><option value="finance">Finance Officer</option><option value="librarian">Librarian</option><option value="admin">Administrator</option></select>
                        <button class="bg-blue-700 text-white rounded-lg px-4 py-2 hover:bg-blue-800">Create User</button>
                    </form>
                    <p id="user-action-status" class="text-sm mt-3"></p>
                </div>
                <div class="bg-white rounded-xl shadow p-6"><div class="flex justify-between items-center mb-4"><h3 class="text-xl font-semibold">System Users</h3><button onclick="loadUsers()" class="text-blue-700">Refresh</button></div><div id="users-table" class="overflow-x-auto">Loading users...</div></div>
                <div class="bg-amber-50 border border-amber-200 rounded-xl p-5"><b>Security:</b> Finance and Library access is role-protected. The Administrator can create separate accounts instead of sharing passwords.</div>
            </div>`;
            await loadUsers();
        }
        async function loadUsers(){
            const box=document.getElementById('users-table'); if(!box) return;
            try { const data=await apiFetch('/api/users'); box.innerHTML=`<table class="min-w-full text-sm"><thead><tr class="bg-gray-100"><th class="p-3 text-left">Username</th><th class="p-3 text-left">Name</th><th class="p-3 text-left">Role</th><th class="p-3 text-left">Status</th><th class="p-3">Actions</th></tr></thead><tbody>${data.users.map(u=>`<tr class="border-b"><td class="p-3">${escapeHtml(u.username)}</td><td class="p-3">${escapeHtml(u.full_name)}</td><td class="p-3">${escapeHtml(u.roleLabel)}</td><td class="p-3">${u.active?'Active':'Disabled'}</td><td class="p-3 text-center"><button onclick="editSystemUser(${u.id},${JSON.stringify(u.full_name)},${JSON.stringify(u.role)},${u.active})" class="text-blue-700 mr-3">Edit</button>${u.id!==CURRENT_USER.id?`<button onclick="deleteSystemUser(${u.id},${JSON.stringify(u.username)})" class="text-red-600">Delete</button>`:''}</td></tr>`).join('')}</tbody></table>`; } catch(e){ box.innerHTML=`<div class="text-red-600">${escapeHtml(e.message)}</div>`; }
        }
        function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
        async function createSystemUser(event){ event.preventDefault(); const status=document.getElementById('user-action-status'); try { await apiFetch('/api/users',{method:'POST',body:JSON.stringify({username:document.getElementById('new-username').value,full_name:document.getElementById('new-fullname').value,password:document.getElementById('new-password').value,role:document.getElementById('new-role').value})}); status.className='text-sm mt-3 text-green-700'; status.textContent='User created successfully.'; event.target.reset(); await loadUsers(); } catch(e){ status.className='text-sm mt-3 text-red-700'; status.textContent=e.message; } }
        async function editSystemUser(id,name,role,active){ const full_name=prompt('Full name:',name); if(full_name===null)return; const newRole=prompt('Role (admin, staff, teacher, finance, librarian):',role); if(newRole===null)return; const password=prompt('New password (leave blank to keep current):',''); const enabled=confirm('Click OK to keep/enable this user. Click Cancel to disable.'); try { await apiFetch('/api/users/'+id,{method:'PUT',body:JSON.stringify({full_name,role:newRole,password:password||undefined,active:enabled})}); await loadUsers(); } catch(e){ alert(e.message); } }
        async function deleteSystemUser(id,username){ if(!confirm('Delete user '+username+'?'))return; try{await apiFetch('/api/users/'+id,{method:'DELETE'}); await loadUsers();}catch(e){alert(e.message);} }

        function loadData() {
            try {
                const storedData = schoolStorage.getItem(DB_KEY);
                if (storedData) {
                    SMS_DB = JSON.parse(storedData);
                    
                    SMS_DB.students = SMS_DB.students || [];
                    SMS_DB.subjects = SMS_DB.subjects || [];
                    SMS_DB.grades = SMS_DB.grades || [];
                    SMS_DB.books = SMS_DB.books || [];
                    SMS_DB.issues = SMS_DB.issues || [];
                    SMS_DB.feeStructures = SMS_DB.feeStructures || [];
                    SMS_DB.invoices = SMS_DB.invoices || [];
                    SMS_DB.payments = SMS_DB.payments || [];
                    SMS_DB.bursaries = SMS_DB.bursaries || [];
                    SMS_DB.expenses = SMS_DB.expenses || [];
                    SMS_DB.leaves = SMS_DB.leaves || [];
                    SMS_DB.gradebookData = SMS_DB.gradebookData || { term: GRADING_TERMS[0], scores: {} }; 
                    
                    // Initialize settings if missing or update sub-properties if missing
                    if (!SMS_DB.settings) {
                        initDB(); 
                    } else {
                        SMS_DB.settings.currentTerm = SMS_DB.settings.currentTerm || GRADING_TERMS[0];
                        SMS_DB.settings.currentYear = SMS_DB.settings.currentYear || new Date().getFullYear();
                        SMS_DB.settings.classes = SMS_DB.settings.classes || [];
                        SMS_DB.settings.streams = SMS_DB.settings.streams || ['A', 'B', 'C']; 
                    }
                } else {
                    initDB();
                    saveData();
                }
            } catch (error) {
                console.error("Error loading data from localStorage:", error);
                initDB(); 
            }
        }

        function saveData() {
            try {
                schoolStorage.setItem(DB_KEY, JSON.stringify(SMS_DB));
            } catch (error) {
                console.error("Error saving data to localStorage:", error);
            }
        }

        function initDB() {
            SMS_DB = {
                students: [
                    { id: 'S001', name: 'Alice Smith', class: 'Grade 10', stream: 'A', gender: 'Female', admissionDate: '2023-09-01', dob: '2008-05-15', entryNo: 'E1001', assessmentNo: 'A5001', fatherName: 'John Smith', fatherId: '30010000', fatherPhone: '0711123456', motherName: 'Jane Smith', motherId: '30010001', motherPhone: '0711123457' },
                    { id: 'S002', name: 'Robert Jones', class: 'Grade 10', stream: 'B', gender: 'Male', admissionDate: '2023-09-01', dob: '2007-11-20', entryNo: 'E1002', assessmentNo: 'A5002', fatherName: 'David Jones', fatherId: '30020000', fatherPhone: '0722223456', motherName: 'Susan Jones', motherId: '30020001', motherPhone: '0722223457' },
                    { id: 'S003', name: 'Emily White', class: 'Grade 9', stream: 'A', gender: 'Female', admissionDate: '2023-09-01', dob: '2009-01-01', entryNo: 'E0903', assessmentNo: 'A4003', fatherName: 'Peter White', fatherId: '30030000', fatherPhone: '0733323456', motherName: 'Mary White', motherId: '30030001', motherPhone: '0733323457' },
                ],
                subjects: [
                    { id: 'SUB01', name: 'Mathematics', max: 100 },
                    { id: 'SUB02', name: 'English', max: 100 },
                    { id: 'SUB03', name: 'Science', max: 100 },
                ],
                grades: [], 
                settings: {
                    currentTerm: GRADING_TERMS[0],
                    currentYear: new Date().getFullYear(), 
                    classes: ['Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'], 
                    streams: ['A', 'B', 'C', 'D'],
                },
                books: [
                    { id: 'B001', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', ISBN: '978-074327', copies: 5, available: 3 },
                    { id: 'B002', title: 'Calculus I', author: 'J. Stewart', ISBN: '978-053849', copies: 10, available: 10 },
                ],
                issues: [
                     { id: generateUniqueId('ISS'), bookId: 'B001', studentId: 'S001', issueDate: '2024-05-01', dueDate: '2024-05-15', returnDate: null }
                ],
                feeStructures: [
                    { id: 'FS001', name: 'Grade 10 - T1 Fees', class: 'Grade 10', term: 'Term 1', year: 2024, amount: 60000 },
                    { id: 'FS002', name: 'Grade 9 - T1 Fees', class: 'Grade 9', term: 'Term 1', year: 2024, amount: 55000 },
                    { id: 'FS003', name: 'Grade 8 - T1 Fees', class: 'Grade 8', term: 'Term 1', year: 2024, amount: 50000 }
                ],
                invoices: [], 
                payments: [],
                bursaries: [], 
                expenses: [
                    { id: generateUniqueId('EXP'), date: '2024-01-10', category: 'Salaries', description: 'Staff Payroll Q1', amount: 250000 },
                    { id: generateUniqueId('EXP'), date: '2024-03-20', category: 'Utilities', description: 'Electricity Bill Q1', amount: 12000 },
                ],
                leaves: [
                    { id: generateUniqueId('L'), studentId: 'S001', type: 'Medical', reason: 'Dental appointment', departureDate: '2024-05-28', expectedReturn: '2024-05-28', returnDate: '2024-05-28', status: 'Returned', authorizedBy: 'Admin' },
                    { id: generateUniqueId('L'), studentId: 'S002', type: 'Home Leave', reason: 'Family emergency', departureDate: '2024-06-01', expectedReturn: '2024-06-05', returnDate: null, status: 'Active', authorizedBy: 'Principal' }
                ],
                gradebookData: { term: GRADING_TERMS[0], scores: {} }
            };
            
            if (SMS_DB.invoices.length === 0) {
                const fs001Amount = SMS_DB.feeStructures.find(s => s.id === 'FS001')?.amount || 60000;
                const fs002Amount = SMS_DB.feeStructures.find(s => s.id === 'FS002')?.amount || 55000;

                SMS_DB.invoices.push({ id: 'INV001', studentId: 'S001', structureId: 'FS001', date: '2024-01-01', amountDue: fs001Amount });
                SMS_DB.invoices.push({ id: 'INV002', studentId: 'S002', structureId: 'FS001', date: '2024-01-01', amountDue: fs001Amount });
                SMS_DB.payments.push({ id: 'PAY001', invoiceId: 'INV002', date: '2024-01-15', amount: 20000, method: 'Bank', receiptData: null }); 
                SMS_DB.invoices.push({ id: 'INV003', studentId: 'S003', structureId: 'FS002', date: '2024-01-01', amountDue: fs002Amount });
                SMS_DB.payments.push({ id: 'PAY002', invoiceId: 'INV003', date: '2024-01-20', amount: 55000, method: 'Cash', receiptData: null }); 
                
                // Ensure FS-CUSTOM exists or is added
                if (!SMS_DB.feeStructures.some(s => s.id === 'FS-CUSTOM')) {
                    SMS_DB.feeStructures.push({ id: 'FS-CUSTOM', name: 'Custom Fee/Ad-Hoc Charge', class: 'ALL', term: 'N/A', year: SMS_DB.settings.currentYear, amount: 0 });
                }
            }
        }
        
        function generateUniqueId(prefix = 'ID') {
            return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5).toUpperCase();
        }

        function confirmClearData() {
            if (confirm("WARNING: This will permanently delete ALL stored system data. Are you absolutely sure?")) {
                schoolStorage.removeItem(DB_KEY);
                alert("All data cleared. System reset.");
                window.location.reload();
            }
        }
        
        function formatDate(dateString) {
            const date = new Date(dateString + 'T00:00:00'); 
            if (isNaN(date.getTime())) return 'N/A'; // Use getTime() for robust NaN check
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        
        function formatCurrency(amount) {
            return `KSh ${parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
        }

        function formatDOB(dateString) {
            if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return 'N/A';
            const date = new Date(dateString + 'T00:00:00'); 
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        
        function parseDOBInput(inputString) {
            if (!inputString) return '';
            inputString = inputString.trim();
            
            // YYYY-MM-DD format
            if (/^\d{4}-\d{2}-\d{2}$/.test(inputString)) {
                const [year, month, day] = inputString.split('-').map(Number);
                if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
                return inputString; 
            }
            
            // DD/MM/YYYY or DD-MM-YYYY
            let parts = inputString.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
            if (parts) {
                const day = parts[1].padStart(2, '0');
                const month = parts[2].padStart(2, '0');
                const year = parts[3];
                
                if (parseInt(month) > 12 || parseInt(day) > 31) return null;
                return `${year}-${month}-${day}`;
            }

            // DD Month YYYY (e.g., 15 May 2008)
            parts = inputString.match(/(\d{1,2})[^\d]+([a-zA-Z]{3,})[^\d]+(\d{4})/);
            if (parts) {
                const day = parts[1].padStart(2, '0');
                const year = parts[3];
                
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const monthStr = parts[2].replace(/[^a-zA-Z]/g, '').substring(0, 3);
                const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthStr.toLowerCase());

                if (monthIndex === -1 || parseInt(day) > 31) return null;

                const month = String(monthIndex + 1).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
            
            return null; 
        }
        
        // Renamed from showUploadModal to reflect JSON for students
        function showStudentUploadModal() {
            uploadModal.classList.remove('hidden');
            document.getElementById('upload-status').textContent = '';
            document.getElementById('student-json-file').value = '';
        }
        
        // Renamed from handleFileUpload to handleStudentUpload for JSON
        function handleStudentUpload(event) {
            event.preventDefault();
            const fileInput = document.getElementById('student-json-file');
            const file = fileInput.files[0];
            const statusDiv = document.getElementById('upload-status');
            
            if (!file) {
                statusDiv.textContent = 'Please select a file.';
                statusDiv.classList.add('text-red-500');
                return;
            }

            statusDiv.textContent = 'Processing...';
            statusDiv.classList.remove('text-red-500');
            statusDiv.classList.add('text-blue-500');

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const jsonData = JSON.parse(e.target.result);
                    importStudentsJson(jsonData, statusDiv);
                } catch (error) {
                    statusDiv.textContent = `Error parsing JSON: ${error.message}`;
                    statusDiv.classList.remove('text-blue-500');
                    statusDiv.classList.add('text-red-500');
                    showLoading(false);
                }
            };
            reader.readAsText(file);
        }

        // New function to import students from JSON
        function importStudentsJson(jsonData, statusDiv) {
            let successCount = 0;
            let errorCount = 0;
            let errorMessages = [];

            if (!Array.isArray(jsonData)) {
                statusDiv.textContent = 'Invalid JSON format: Expected an array of student objects.';
                statusDiv.classList.add('text-red-500');
                return;
            }
            
            jsonData.forEach((studentData, index) => {
                const studentId = (studentData.id || '').trim();
                const studentName = (studentData.name || '').trim();
                const studentClass = (studentData.class || '').trim();
                const dobInput = (studentData.dob || '').trim();
                
                const dobYMD = parseDOBInput(dobInput);

                if (!studentId || !studentName || !studentClass || !dobYMD) {
                    errorCount++;
                    errorMessages.push(`Entry ${index + 1}: Missing required fields or Invalid DOB format (ID: ${studentId || 'N/A'}, Name: ${studentName || 'N/A'}, Class: ${studentClass || 'N/A'}, DOB Input: ${dobInput || 'N/A'}).`);
                    return;
                }

                if (SMS_DB.students.some(s => s.id === studentId)) {
                    errorCount++;
                    errorMessages.push(`Entry ${index + 1}: Admission number ${studentId} already exists (Skipped).`);
                    return;
                }
                
                if (SMS_DB.settings && SMS_DB.settings.classes && !SMS_DB.settings.classes.includes(studentClass)) {
                    SMS_DB.settings.classes.push(studentClass);
                }

                const newStudent = {
                    id: studentId, 
                    name: studentName, 
                    class: studentClass, 
                    stream: (studentData.stream || SMS_DB.settings?.streams?.[0] || 'A').trim(), 
                    gender: (studentData.gender || 'N/A').trim(), 
                    admissionDate: (studentData.admissionDate || new Date().toISOString().split('T')[0]).trim(),
                    dob: dobYMD, 
                    entryNo: (studentData.entryNo || '').trim(), 
                    assessmentNo: (studentData.assessmentNo || '').trim(), 
                    fatherName: (studentData.fatherName || '').trim(), 
                    fatherId: (studentData.fatherId || '').trim(), 
                    fatherPhone: (studentData.fatherPhone || '').trim(), 
                    motherName: (studentData.motherName || '').trim(), 
                    motherId: (studentData.motherId || '').trim(), 
                    motherPhone: (studentData.motherPhone || '').trim()
                };

                SMS_DB.students.push(newStudent);
                successCount++;
            });
            
            saveData();
            
            statusDiv.classList.remove('text-blue-500');
            if (errorCount > 0) {
                statusDiv.classList.add('text-red-500');
                statusDiv.innerHTML = `Import Complete. ${successCount} students added. ${errorCount} errors occurred. <div class="mt-2 text-xs text-red-700 max-h-24 overflow-y-auto border p-1">${errorMessages.join('<br>')}</div>`;
            } else {
                statusDiv.classList.add('text-green-600');
                statusDiv.textContent = `Successfully imported ${successCount} students.`;
            }

            if (successCount > 0) {
                setTimeout(() => {
                    uploadModal.classList.add('hidden');
                    navigate('students');
                }, 1500);
            }
        }


        function createCard(title, value, iconName, bgColor, onClick) {
            const icons = {
                'users': `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2a3 3 0 015-2.236M7 20h10M6 12V6a1 1 0 011-1h10a1 1 0 011 1v6M6 12h12"></path></svg>`,
                'archive': `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>`,
                'book-open': `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.5v11.75c0 .354-.286.64-.64.64H6.64a.64.64 0 01-.64-.64V6.5m10 0v11.75c0 .354-.286.64-.64.64H16.36a.64.64 0 01-.64-.64V6.5m-5 0V3.75a.75.75 0 00-1.5 0V6.5h1.5zM12 6.5h-.75M12 6.5h.75M8 6.5h1.5M16 6.5h-1.5"></path></svg>`,
                'currency': `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m0 0l-1 1h8m-9-2v2m2-2v2m-2-2h2m-2 0V9m0 0V7m0 2h2m-2 0H5m16 0h-5m0 0v2m0-2h5m-5 0V7m0 2h5"></path></svg>`,
                'minus': `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>`,
                'trending-up': `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>`,
                'alert': `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
                'import': `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>`,
                'export': `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>`,
            };
            const iconSvg = icons[iconName] || '';
            const action = onClick ? `onclick='${onClick}'` : '';
            return `
                <div class="p-6 ${bgColor} text-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 ${onClick ? 'cursor-pointer' : ''}" ${action}>
                    <div class="flex items-center justify-between">
                        <div class="text-sm font-medium opacity-80">${title}</div>
                        ${iconSvg}
                    </div>
                    <div class="text-3xl font-bold mt-2">${value}</div>
                </div>
            `;
        }
        
        function createActionButton(title, action, iconName) {
            const icons = {
                'person-add': `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>`,
                'edit': `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-7 1l2-2m-2 2l-2 2m4 0L14 7l4-4 2 2-4 4z"></path></svg>`,
                'trending-up': `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>`,
                'dollar': `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m0 0l-1 1h8m-9-2v2m2-2v2m-2-2h2m-2 0V9m0 0V7m0 2h2m-2 0H5m16 0h-5m0 0v2m0-2h5m-5 0V7m0 2h5"></path></svg>`,
                'print': `<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6m-6 0v-5a2 2 0 012-2h2a2 2 0 012 2v5m-6 0h6"></path></svg>`,
                'export': `<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>`,
                'trash': `<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`,
            };
            return `
                <button onclick="${action}" class="flex items-center justify-center p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 rounded-lg text-gray-700 hover:text-indigo-700 transition duration-200 shadow-sm">
                    ${icons[iconName]}
                    <span class="font-medium">${title}</span>
                </button>
            `;
        }

        function navigate(view, params = {}) {
            if (view === 'finance' && !protectSection('finance')) return;
            if (view === 'library' && !protectSection('library')) return;
            if (view === 'admin' && !protectSection('admin')) return;
            showLoading();
            currentView = view;
            currentStudentId = params.studentId || null;
            
            if (view === 'library' && !params.subView) {
                currentSubView = 'catalog';
            } else if (view === 'finance' && !params.subView) {
                currentSubView = 'invoicing';
            } else {
                 currentSubView = params.subView || null;
            }
            
            if (document.getElementById('sms-container').classList.contains('hidden') === false) {
                 document.querySelectorAll('nav a').forEach(el => {
                    el.classList.remove('bg-blue-700');
                });
                const activeNav = document.getElementById(`nav-${view.split('-')[0]}`);
                if (activeNav) activeNav.classList.add('bg-blue-700');
            }
            
            
            uploadModal.classList.add('hidden');
            exportModal.classList.add('hidden');
            dailyPaymentsModal.classList.add('hidden'); 
            deleteClassModal.classList.add('hidden');
            financeImportModal.classList.add('hidden'); // New: Hide finance import modal


            setTimeout(() => { 
                try {
                    switch (view) {
                        case 'dashboard':
                            renderDashboard();
                            break;
                        case 'students':
                            renderStudentList();
                            break;
                        case 'students-add':
                        case 'students-edit':
                            renderStudentForm(params.studentId);
                            break;
                        case 'leave':
                            renderLeaveManagement();
                            break;
                        case 'gradebook':
                            renderGradebook(); 
                            break;
                        case 'library':
                            renderLibrary();
                            break;
                        case 'finance':
                            renderFinance();
                            break;
                        case 'reports':
                            renderReports();
                            break;
                        case 'admin':
                            renderAdmin();
                            break;
                        case 'library-book-add':
                        case 'library-book-edit':
                            renderBookForm(params.bookId);
                            break;
                        default:
                            contentContainer.innerHTML = `<div class="p-6 bg-white shadow rounded">404 View Not Found: ${view}</div>`;
                    }
                } catch (error) {
                     console.error("Navigation rendering failed:", error);
                     contentContainer.innerHTML = `<div class="p-6 bg-red-100 text-red-800 rounded">Error rendering view: ${error.message}. Please check console for details.</div>`;
                } finally {
                    showLoading(false);
                }
            }, 50); 

            if (window.innerWidth < 768) {
                sidebar.classList.add('-translate-x-full');
            }
        }
        
        function getInvoiceDetails(invoice) {
            const structure = SMS_DB.feeStructures?.find(s => s.id === invoice.structureId);
            const student = SMS_DB.students?.find(s => s.id === invoice.studentId);
            const totalPayments = SMS_DB.payments
                .filter(p => p.invoiceId === invoice.id)
                .reduce((sum, p) => sum + p.amount, 0);
            const totalBursaries = SMS_DB.bursaries
                .filter(b => b.invoiceId === invoice.id)
                .reduce((sum, b) => sum + b.amount, 0);
            
            const baseAmount = Number(invoice.amountDue || (structure ? structure.amount : 0));
            // Money brought forward is ALWAYS added to the new invoice. It is
            // deliberately kept separate from amountDue so a term/grade change
            // can never reduce the new term's charge.
            const carriedForwardAmount = Number(invoice.carriedForwardAmount || 0);

            // carriedForwardAmount belongs to THIS invoice and is added to its
            // new term/grade charges. A separate transferredBalance records the
            // portion of this invoice's outstanding balance that was moved to a
            // later invoice. Keeping these two fields separate prevents a balance
            // from being subtracted/added twice when a learner changes grade.
            const transferredBalance = invoice.transferredBalance !== undefined
                ? Number(invoice.transferredBalance || 0)
                // Compatibility with records created by the previous version:
                // those records stored the transferred amount in carriedForwardAmount.
                : (invoice.carriedForwardTo ? Number(invoice.carriedForwardAmount || 0) : 0);
            // New invoice total = new charge + previous outstanding balance -
            // bursaries/credits applied to THIS invoice. The transferredBalance
            // belongs to the OLD invoice and is used only to close that old
            // invoice after its outstanding amount has been moved forward.
            const netDue = baseAmount + carriedForwardAmount - totalBursaries;
            const balance = netDue - totalPayments;
            
            return {
                ...invoice,
                amountDue: baseAmount, 
                carriedForwardAmount: parseFloat(carriedForwardAmount.toFixed(2)),
                transferredBalance: parseFloat(transferredBalance.toFixed(2)),
                studentName: student ? student.name : 'Unknown Student',
                studentClass: student ? student.class : 'N/A',
                structureName: structure ? structure.name : 'N/A',
                totalPayments: parseFloat(totalPayments.toFixed(2)),
                totalBursaries: parseFloat(totalBursaries.toFixed(2)),
                netDue: parseFloat(netDue.toFixed(2)),
                balance: parseFloat(balance.toFixed(2)),
                status: balance <= 0.01 ? 'Paid' : (balance < netDue ? 'Partial' : 'Outstanding')
            };
        }
        // Move all outstanding balances from previous invoices onto a new invoice.
        // IMPORTANT: never overwrite the old invoice's carriedForwardAmount. That
        // field belongs to money brought INTO that old invoice. The amount moved
        // OUT is stored separately in transferredBalance, so the old invoice closes
        // correctly while the new invoice adds the balance to its own charges.
        function carryForwardStudentBalance(studentId, newInvoiceId) {
            const previousInvoices = (SMS_DB.invoices || []).filter(inv =>
                inv.studentId === studentId &&
                inv.id !== newInvoiceId &&
                !inv.carriedForwardTo
            );

            let carriedTotal = 0;
            previousInvoices.forEach(inv => {
                const details = getInvoiceDetails(inv);
                const outstanding = Number(details.balance || 0);
                if (outstanding > 0.01) {
                    // The outstanding amount leaves the old invoice and is added
                    // to the NEW invoice. Do not subtract it from the new invoice.
                    inv.carriedForwardTo = newInvoiceId;
                    inv.transferredBalance = parseFloat(outstanding.toFixed(2));
                    carriedTotal += outstanding;
                }
            });

            return parseFloat(carriedTotal.toFixed(2));
        }

        function calculateStudentBalance(studentId) {
            const studentInvoices = SMS_DB.invoices.filter(inv => inv.studentId === studentId);
            let totalBalance = 0;
            studentInvoices.forEach(inv => {
                totalBalance += getInvoiceDetails(inv).balance;
            });
            return parseFloat(totalBalance.toFixed(2));
        }
        function getStudentPaymentSummary(studentId) {
            const student = SMS_DB.students.find(s => s.id === studentId); 
            if (!student) { return { studentId: studentId, name: 'Unknown', class: 'N/A', totalInvoicedNet: 0, totalPaid: 0, balance: 0, status: 'N/A' }; }
            const studentInvoices = SMS_DB.invoices.filter(inv => inv.studentId === studentId);
            let totalInvoicedNet = 0;
            let totalPaid = 0;
            studentInvoices.forEach(inv => {
                const details = getInvoiceDetails(inv);
                totalInvoicedNet += details.netDue;
                totalPaid += details.totalPayments;
            });
            const balance = totalInvoicedNet - totalPaid;
            const fixedBalance = parseFloat(balance.toFixed(2));
            return { studentId: student.id, name: student.name, class: student.class, totalInvoicedNet: parseFloat(totalInvoicedNet.toFixed(2)), totalPaid: parseFloat(totalPaid.toFixed(2)), balance: fixedBalance, status: fixedBalance <= 0.01 ? 'Paid' : (fixedBalance < totalInvoicedNet ? 'Partial' : 'Outstanding') };
        }

        function createSearchableStudentSelect(id, required = true) {
            const studentList = SMS_DB.students?.map(s => ({
                id: s.id,
                name: `${s.name} (${s.id}) - ${s.class}`
            }))?.sort((a, b) => a.name.localeCompare(b.name)) || [];
            
            const reqAttr = required ? 'required' : '';
            
            return `
                <div class="relative inline-block w-full z-20" id="searchable-select-container-${id}">
                    <input type="hidden" name="${id}" id="${id}" value="" ${reqAttr} data-selected-name="" />
                    <input type="text" id="search-input-${id}" placeholder="Search and select student (e.g., S001, Alice)..." 
                           class="w-full p-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white" 
                           onfocus="showStudentDropdown('${id}')" 
                           oninput="filterStudentDropdown('${id}')" 
                           onblur="hideStudentDropdown('${id}')"
                           autocomplete="off" />
                    
                    <div id="dropdown-${id}" 
                         class="absolute w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg hidden max-h-60 overflow-y-auto custom-scroll" 
                         style="z-index: 100;">
                        ${studentList.map(s => `
                            <div class="p-2 cursor-pointer hover:bg-blue-100 text-sm border-b border-gray-100 last:border-b-0" 
                                 data-id="${s.id}" 
                                 onmousedown="selectStudent('${id}', '${s.id}', '${s.name.replace(/'/g, "\\'")}')">
                                ${s.name}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        function showStudentDropdown(id) {
            requestAnimationFrame(() => {
                document.getElementById(`dropdown-${id}`).classList.remove('hidden');
            }); 
        }

        function hideStudentDropdown(id) {
            setTimeout(() => {
                document.getElementById(`dropdown-${id}`).classList.add('hidden');
            }, 200); 
        }

        function filterStudentDropdown(id) {
            const input = document.getElementById(`search-input-${id}`);
            const filter = input.value.toUpperCase();
            const dropdown = document.getElementById(`dropdown-${id}`);
            const items = dropdown.children;

            for (let i = 0; i < items.length; i++) {
                const text = items[i].textContent || items[i].innerText;
                if (text.toUpperCase().indexOf(filter) > -1) {
                    items[i].style.display = "";
                } else {
                    items[i].style.display = "none";
                }
            }
            dropdown.classList.remove('hidden');
        }

        function selectStudent(containerId, studentId, studentName) {
            const hiddenInput = document.getElementById(containerId);
            const searchInput = document.getElementById(`search-input-${containerId}`);
            
            hiddenInput.value = studentId;
            searchInput.value = studentName;
            
            if (hiddenInput.hasAttribute('required')) {
                 searchInput.setCustomValidity(''); 
            }
            
            hideStudentDropdown(containerId);
        }
        
        function renderDashboard() { 
            pageTitle.textContent = "System Dashboard";
            const totalStudents = SMS_DB.students?.length || 0;
            const outstandingBalance = SMS_DB.invoices?.map(getInvoiceDetails).reduce((sum, inv) => sum + inv.balance, 0) || 0;
            const issuedBooks = SMS_DB.issues?.filter(i => !i.returnDate).length || 0;
            
            const dashboardHTML = `
                <div class="space-y-6">
                    <h2 class="text-3xl font-extrabold text-gray-900">Welcome to ${SCHOOL_NAME} Control Panel</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        ${createCard('Total Students', totalStudents, 'users', 'bg-blue-600', 'navigate("students")')}
                        ${createCard('Outstanding Fees', formatCurrency(outstandingBalance), 'currency', 'bg-indigo-600', 'navigate("finance")')}
                        ${createCard('Issued Books', issuedBooks, 'book-open', 'bg-purple-600', 'navigate("library")')}
                        ${createCard('Students on Leave', SMS_DB.leaves?.filter(l => l.status === 'Active').length || 0, 'alert', 'bg-red-600', 'navigate("leave")')}
                    </div>
                    <div class="bg-white p-6 rounded-xl shadow-lg">
                        <h3 class="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">Quick Actions</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            ${createActionButton('Add New Student', 'navigate("students-add")', 'person-add')}
                            ${createActionButton('Approve Leave Out', 'navigate("leave")', 'edit')}
                            ${createActionButton('Generate Invoice', 'navigate("finance", { subView: "invoicing" })', 'dollar')}
                            ${createActionButton('View Financial Report', 'navigate("finance", { subView: "financial_reports" })', 'trending-up')}
                        </div>
                    </div>
                </div>
            `;
            contentContainer.innerHTML = dashboardHTML;
        }

        function deleteStudent(studentId) {
            if (!confirm(`WARNING: Are you sure you want to permanently delete student ID ${studentId} and ALL related data (invoices, leaves, library issues)? This action cannot be undone.`)) {
                return;
            }
            
            showLoading();
            
            SMS_DB.students = SMS_DB.students.filter(s => s.id !== studentId);

            SMS_DB.grades = SMS_DB.grades.filter(g => g.studentId !== studentId);
            SMS_DB.leaves = SMS_DB.leaves.filter(l => l.studentId !== studentId);
            SMS_DB.issues = SMS_DB.issues.filter(i => i.studentId !== studentId);
            
            const studentInvoices = SMS_DB.invoices.filter(inv => inv.studentId === studentId);
            const deletedInvoiceIds = studentInvoices.map(inv => inv.id);
            
            SMS_DB.invoices = SMS_DB.invoices.filter(inv => inv.studentId !== studentId);
            SMS_DB.payments = SMS_DB.payments.filter(p => !deletedInvoiceIds.includes(p.invoiceId));
            SMS_DB.bursaries = SMS_DB.bursaries.filter(b => !deletedInvoiceIds.includes(b.invoiceId));
            
            if (SMS_DB.gradebookData && SMS_DB.gradebookData.scores) {
                delete SMS_DB.gradebookData.scores[studentId];
            }


            saveData();
            navigate('students'); 
            alert(`Student ${studentId} and all related records deleted successfully.`);
        }

        function showClassDeletionModal() {
            const currentClasses = [...new Set(SMS_DB.students?.map(s => s.class))].filter(c => c).sort();
            const select = document.getElementById('delete-class-select');
            
            select.innerHTML = '<option value="">-- Select Class --</option>';
            currentClasses.forEach(c => {
                select.innerHTML += `<option value="${c}">${c}</option>`;
            });

            deleteClassModal.classList.remove('hidden');
        }

        function handleClassDeletionSubmission(event) {
            event.preventDefault();
            const selectedClass = document.getElementById('delete-class-select').value;
            
            if (!selectedClass) {
                alert("Please select a class.");
                return;
            }

            if (confirm(`ARE YOU SURE? This will permanently delete ALL students in ${selectedClass} and all their history. This cannot be undone.`)) {
                deleteClassModal.classList.add('hidden');
                deleteStudentsByClass(selectedClass);
            }
        }

        function deleteStudentsByClass(className) {
            showLoading();
            
            const studentsToDelete = SMS_DB.students.filter(s => s.class === className);
            const studentIdsToDelete = studentsToDelete.map(s => s.id);
            
            if (studentIdsToDelete.length === 0) {
                alert(`No students found in class ${className}.`);
                showLoading(false);
                return;
            }

            SMS_DB.students = SMS_DB.students.filter(s => s.class !== className);

            SMS_DB.grades = SMS_DB.grades.filter(g => !studentIdsToDelete.includes(g.studentId));
            SMS_DB.leaves = SMS_DB.leaves.filter(l => !studentIdsToDelete.includes(l.studentId));
            SMS_DB.issues = SMS_DB.issues.filter(i => !studentIdsToDelete.includes(i.studentId));
            
            const deletedInvoiceIds = SMS_DB.invoices
                .filter(inv => studentIdsToDelete.includes(inv.studentId))
                .map(inv => inv.id);
            
            SMS_DB.invoices = SMS_DB.invoices.filter(inv => !studentIdsToDelete.includes(inv.studentId));
            SMS_DB.payments = SMS_DB.payments.filter(p => !deletedInvoiceIds.includes(p.invoiceId));
            SMS_DB.bursaries = SMS_DB.bursaries.filter(b => !deletedInvoiceIds.includes(b.invoiceId));
            
            if (SMS_DB.gradebookData && SMS_DB.gradebookData.scores) {
                studentIdsToDelete.forEach(id => {
                    delete SMS_DB.gradebookData.scores[id];
                });
            }

            saveData();
            navigate('students');
            alert(`Successfully deleted ${studentIdsToDelete.length} students from class ${className} and all related records.`);
        }

        function filterStudentTable() {
            const filter = document.getElementById('student-search-input').value.toUpperCase();
            const tableBody = document.getElementById('student-list-body');
            if (!tableBody) return;
            const rows = tableBody.getElementsByTagName('tr');
            
            for (let i = 0; i < rows.length; i++) {
                const idCell = rows[i].getElementsByTagName('td')[0];
                const nameCell = rows[i].getElementsByTagName('td')[1];
                if (idCell && nameCell) {
                    const idText = idCell.textContent || idCell.innerText;
                    const nameText = nameCell.textContent || nameCell.innerText;
                    if (idText.toUpperCase().indexOf(filter) > -1 || nameText.toUpperCase().indexOf(filter) > -1) {
                        rows[i].style.display = "";
                    } else {
                        rows[i].style.display = "none";
                    }
                }
            }
        }

        // Helper function to format values for CSV, handling commas and quotes
        function toCsvValue(value) {
            if (value === null || value === undefined) {
                return '';
            }
            let stringValue = String(value);
            // If the value contains a comma, double quote, or newline, enclose it in double quotes
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                // Escape existing double quotes by doubling them
                stringValue = stringValue.replace(/"/g, '""');
                return `"${stringValue}"`;
            }
            return stringValue;
        }

        // New function to export students as JSON
        function exportStudentsJson() {
            showLoading(true);
            
            const studentsToExport = (SMS_DB.students || []).map(s => ({
                id: s.id,
                name: s.name,
                class: s.class,
                stream: s.stream,
                gender: s.gender,
                admissionDate: s.admissionDate,
                dob: s.dob,
                entryNo: s.entryNo,
                assessmentNo: s.assessmentNo,
                fatherName: s.fatherName,
                fatherId: s.fatherId,
                fatherPhone: s.fatherPhone,
                motherName: s.motherName,
                motherId: s.motherId,
                motherPhone: s.motherPhone,
            }));

            const jsonString = JSON.stringify(studentsToExport, null, 2); // Pretty-print JSON
            const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `Mabasi_Students_Roster_All_Details_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url); 

            showLoading(false);
            alert("Student roster exported successfully as JSON.");
        }
        
        // Move a learner between grades/classes without deleting or altering academic/financial history.
        function showMoveStudentModal(studentId) {
            const student = (SMS_DB.students || []).find(s => s.id === studentId);
            if (!student) { alert('Learner not found.'); return; }

            const allClasses = [...new Set([...(SMS_DB.settings?.classes || []), ...(SMS_DB.students || []).map(s => s.class)])]
                .filter(Boolean).sort();
            const streams = SMS_DB.settings?.streams || ['A','B','C','D'];

            let modal = document.getElementById('move-student-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'move-student-modal';
                modal.className = 'fixed inset-0 bg-slate-900/70 z-[200] flex items-center justify-center p-4';
                document.body.appendChild(modal);
            }
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-7">
                    <div class="flex justify-between items-start border-b pb-4 mb-5">
                        <div>
                            <h2 class="text-xl font-bold text-gray-800">Move Learner to Another Grade</h2>
                            <p class="text-sm text-gray-500 mt-1">${escapeHtml(student.name)} (${escapeHtml(student.id)})</p>
                        </div>
                        <button type="button" onclick="closeMoveStudentModal()" class="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
                    </div>
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5 text-sm text-blue-800">
                        Current grade: <strong>${escapeHtml(student.class || 'N/A')}</strong> / ${escapeHtml(student.stream || 'N/A')}<br>
                        Academic marks, attendance, fee records, library records and other linked records will remain attached to this learner.
                    </div>
                    <form onsubmit="moveStudentToGrade(event, '${studentId}')" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">New Grade / Class</label>
                            <input id="move-student-class" list="move-class-list" value="${escapeHtml(student.class || '')}" required class="w-full p-3 border rounded-lg">
                            <datalist id="move-class-list">${allClasses.map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">New Stream</label>
                            <select id="move-student-stream" class="w-full p-3 border rounded-lg">
                                ${streams.map(st => `<option value="${escapeHtml(st)}" ${student.stream === st ? 'selected' : ''}>${escapeHtml(st)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="flex justify-end gap-3 pt-3 border-t">
                            <button type="button" onclick="closeMoveStudentModal()" class="px-5 py-2.5 rounded-lg bg-gray-200 text-gray-700">Cancel</button>
                            <button type="submit" class="px-5 py-2.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700">Move Learner</button>
                        </div>
                    </form>
                </div>`;
            modal.classList.remove('hidden');
        }

        function closeMoveStudentModal() {
            const modal = document.getElementById('move-student-modal');
            if (modal) modal.remove();
        }

        function moveStudentToGrade(event, studentId) {
            event.preventDefault();
            const student = (SMS_DB.students || []).find(s => s.id === studentId);
            if (!student) { alert('Learner not found.'); return; }

            const newClass = document.getElementById('move-student-class').value.trim();
            const newStream = document.getElementById('move-student-stream').value;
            const oldClass = student.class || '';
            const oldStream = student.stream || '';
            if (!newClass) { alert('Please select or enter the new grade/class.'); return; }
            if (newClass === oldClass && newStream === oldStream) { closeMoveStudentModal(); return; }

            if (!confirm(`Move ${student.name} from ${oldClass} / ${oldStream} to ${newClass} / ${newStream}?`)) return;

            const now = new Date().toISOString();
            student.classHistory = Array.isArray(student.classHistory) ? student.classHistory : [];
            student.classHistory.push({ fromClass: oldClass, fromStream: oldStream, toClass: newClass, toStream: newStream, movedAt: now });
            student.class = newClass;
            student.stream = newStream;

            if (SMS_DB.settings) {
                SMS_DB.settings.classes = SMS_DB.settings.classes || [];
                if (!SMS_DB.settings.classes.includes(newClass)) SMS_DB.settings.classes.push(newClass);
            }
            saveData();
            closeMoveStudentModal();
            renderStudentList();
            alert(`${student.name} has been moved successfully to ${newClass} / ${newStream}. Existing records have been preserved.`);
        }

        function renderStudentList() { 
            pageTitle.textContent = "Student Information Management";
            
            const validStudents = (SMS_DB.students || [])
                .filter(s => s && s.id && s.name && s.class);

            const students = validStudents.sort((a, b) => a.id.localeCompare(b.id));

            let tableRows = students.map(student => {
                const studentId = student.id || 'N/A';
                const studentName = student.name || 'N/A';
                const studentClass = student.class || 'N/A';
                const studentStream = student.stream || 'N/A';
                const studentDob = formatDOB(student.dob) || 'N/A';

                return `
                    <tr class="hover:bg-gray-50 border-b">
                        <td class="px-6 py-4 font-medium text-gray-900">${studentId}</td>
                        <td class="px-6 py-4">${studentName}</td>
                        <td class="px-6 py-4">${studentClass} / ${studentStream}</td>
                        <td class="px-6 py-4">${studentDob}</td>
                        <td class="px-6 py-4 flex space-x-2">
                            <button onclick="navigate('students-edit', { studentId: '${studentId}' })" class="text-blue-600 hover:text-blue-900 text-sm">Edit</button>
                            <button onclick="showMoveStudentModal('${studentId}')" class="text-green-600 hover:text-green-900 text-sm font-medium">Move Grade</button>
                            <button onclick="deleteStudent('${studentId}')" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
                        </td>
                    </tr>
                `;
            }).join('');

            const studentListHTML = `
                <div class="bg-white p-6 rounded-xl shadow-lg">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b pb-4">
                        <h2 class="text-2xl font-semibold text-gray-800 mb-4 md:mb-0">Student List (${students.length})</h2>
                        <div class="flex space-x-3 flex-wrap gap-2">
                            <button onclick="navigate('students-add')" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200 shadow-md text-sm">
                                + Add New Student
                            </button>
                            <button onclick="showStudentUploadModal()" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition duration-200 shadow-md text-sm">
                                <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 8m4-4v12"></path></svg>
                                Upload Student Data (JSON)
                            </button>
                            <button onclick="showReportFilterModal('student_roster', 'Export Student Roster (PDF) by Class & Stream', 'Generate Roster PDF')" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition duration-200 shadow-md text-sm">
                                <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                Export Roster (PDF)
                            </button>
                            <button onclick="exportStudentsJson()" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition duration-200 shadow-md text-sm">
                                <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                Export All Details (JSON)
                            </button>
                            <button onclick="showClassDeletionModal()" class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition duration-200 shadow-md text-sm">
                                <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                Delete Class
                            </button>
                        </div>
                    </div>
                    
                    <div class="mb-4">
                        <input type="text" id="student-search-input" oninput="filterStudentTable()" placeholder="Search students by Adm. No or Name..." class="w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500">
                    </div>

                    ${students.length === 0 
                        ? `<div class="text-center py-10 text-gray-500">No students registered yet.</div>` 
                        : `<div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adm. No.</th>
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Full Name</th>
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class / Stream</th>
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DOB</th>
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200" id="student-list-body">${tableRows}</tbody>
                            </table>
                        </div>`
                    }
                </div>
            `;
            contentContainer.innerHTML = studentListHTML;
        }

        function renderStudentForm(studentId = null) {
            const isEditing = !!studentId;
            pageTitle.textContent = isEditing ? "Edit Student Profile" : "New Student Admission";
            
            const defaultStudent = { id: generateUniqueId('ST'), name: '', class: '', stream: SMS_DB.settings?.streams?.[0] || 'A', gender: 'N/A', admissionDate: new Date().toISOString().split('T')[0], dob: '', entryNo: '', assessmentNo: '', fatherName: '', fatherId: '', fatherPhone: '', motherName: '', motherId: '', motherPhone: '' };
            const student = isEditing ? SMS_DB.students.find(s => s.id === studentId) || defaultStudent : defaultStudent;
            
            const allClasses = [...new Set([...(SMS_DB.settings?.classes || []), ...(SMS_DB.students?.map(s => s.class) || [])])].filter(c => c).sort();
            const classOptions = allClasses.map(c => `<option value="${c}">${c}</option>`).join('');

            const streamsOptions = (SMS_DB.settings?.streams || []).map(s => `<option value="${s}" ${student.stream === s ? 'selected' : ''}>${s}</option>`).join('');
            
            const displayDob = formatDOB(student.dob);

            const formHTML = `
                <div class="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-2xl">
                    <h2 class="text-2xl font-bold mb-6 text-gray-800">${isEditing ? `Editing Student: ${student.name}` : 'Register New Student'}</h2>
                    <form id="student-form" onsubmit="handleStudentSubmission(event, '${studentId || ''}')">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            
                            <div class="space-y-4 p-4 border rounded-lg bg-blue-50">
                                <h3 class="font-semibold text-lg text-blue-800 border-b pb-2 mb-4">Student Information</h3>

                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Adm. No.</label>
                                    <input type="text" id="id" name="id" value="${student.id}" ${isEditing ? 'readonly' : ''} required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 ${isEditing ? 'bg-gray-100' : 'border'}">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Full Name</label>
                                    <input type="text" id="name" name="name" value="${student.name}" required class="mt-1 block w-full rounded-md border p-3">
                                </div>
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700">Class (e.g., Grade 10)</label>
                                        <input list="class-list" type="text" id="class" name="class" value="${student.class}" required class="mt-1 block w-full rounded-md border p-3" placeholder="Start typing class...">
                                         <datalist id="class-list">
                                            ${classOptions}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700">Stream</label>
                                        <select id="stream" name="stream" required class="mt-1 block w-full rounded-md border p-3">
                                            ${streamsOptions}
                                        </select>
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Date of Birth (e.g., 15 May 2008 or 15/05/2008)</label>
                                    <input type="text" id="dob" name="dob" value="${displayDob === 'N/A' ? '' : displayDob}" placeholder="DD Month YYYY or DD/MM/YYYY" required class="mt-1 block w-full rounded-md border p-3">
                                </div>
                                
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700">Entry Number</label>
                                        <input type="text" id="entryNo" name="entryNo" value="${student.entryNo}" class="mt-1 block w-full rounded-md border p-3">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700">Assessment Number</label>
                                        <input type="text" id="assessmentNo" name="assessmentNo" value="${student.assessmentNo}" class="mt-1 block w-full rounded-md border p-3">
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-4 p-4 border rounded-lg bg-green-50">
                                <h3 class="font-semibold text-lg text-green-800 border-b pb-2 mb-4">Parent/Guardian Information</h3>
                                
                                <div class="space-y-2 border-b pb-3">
                                    <h4 class="font-medium text-gray-800">Father's Details</h4>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700">Father's Full Name</label>
                                        <input type="text" id="fatherName" name="fatherName" value="${student.fatherName}" class="mt-1 block w-full rounded-md border p-3">
                                    </div>
                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700">Father's ID Number</label>
                                            <input type="text" id="fatherId" name="fatherId" value="${student.fatherId}" class="mt-1 block w-full rounded-md border p-3">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700">Father's Phone</label>
                                            <input type="tel" id="fatherPhone" name="fatherPhone" value="${student.fatherPhone}" class="mt-1 block w-full rounded-md border p-3">
                                        </div>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    <h4 class="font-medium text-gray-800">Mother's Details</h4>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700">Mother's Full Name</label>
                                        <input type="text" id="motherName" name="motherName" value="${student.motherName}" class="mt-1 block w-full rounded-md border p-3">
                                    </div>
                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700">Mother's ID Number</label>
                                            <input type="text" id="motherId" name="motherId" value="${student.motherId}" class="mt-1 block w-full rounded-md border p-3">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700">Mother's Phone</label>
                                            <input type="tel" id="motherPhone" name="motherPhone" value="${student.motherPhone}" class="mt-1 block w-full rounded-md border p-3">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mt-8 pt-4 border-t flex justify-end space-x-4">
                            <button type="button" onclick="navigate('students')" class="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg">Cancel</button>
                            <button type="submit" class="bg-blue-600 text-white px-6 py-3 rounded-lg">${isEditing ? 'Save Changes' : 'Admit Student'}</button>
                        </div>
                    </form>
                </div>
            `;
            contentContainer.innerHTML = formHTML;
        }

        function handleStudentSubmission(event, studentId) {
            event.preventDefault();
            const form = event.target;
            const isEditing = !!studentId;
            
            const dobInput = form.elements['dob'].value.trim();
            const dobYMD = parseDOBInput(dobInput);
            
            if (!dobYMD) {
                alert("Invalid Date of Birth format. Please use DD Month YYYY (e.g., 15 May 2008) or DD/MM/YYYY.");
                return;
            }
            
            const className = form.elements['class'].value.trim();
             if (className && SMS_DB.settings && SMS_DB.settings.classes && !SMS_DB.settings.classes.includes(className)) {
                SMS_DB.settings.classes.push(className);
            }


            const formData = {
                id: form.elements['id'].value.trim(),
                name: form.elements['name'].value.trim(),
                class: className, 
                stream: form.elements['stream'].value, 
                dob: dobYMD, 
                entryNo: form.elements['entryNo'].value,
                assessmentNo: form.elements['assessmentNo'].value,
                fatherName: form.elements['fatherName'].value,
                fatherId: form.elements['fatherId'].value,
                fatherPhone: form.elements['fatherPhone'].value,
                motherName: form.elements['motherName'].value,
                motherId: form.elements['motherId'].value,
                motherPhone: form.elements['motherPhone'].value,
                gender: 'N/A', 
                admissionDate: new Date().toISOString().split('T')[0],
            };
            
            if (isEditing) {
                const index = SMS_DB.students.findIndex(s => s.id === studentId);
                if (index !== -1) { 
                    SMS_DB.students[index] = { ...SMS_DB.students[index], ...formData }; 
                }
            } else {
                if(SMS_DB.students.some(s => s.id === formData.id)) {
                    alert('Admission number already exists. Please choose a different ID.');
                    return;
                }
                SMS_DB.students.push(formData);
            }
            saveData();
            navigate('students');
        }
        
        function updateStreamOptions() {
            const classSelect = document.getElementById('export-class-select');
            const streamSelect = document.getElementById('export-stream-select');
            const selectedClass = classSelect.value;
            
            streamSelect.innerHTML = '<option value="ALL">ALL STREAMS</option>';
            
            if (selectedClass !== 'ALL') {
                const classStreams = [...new Set(SMS_DB.students
                    .filter(s => s.class === selectedClass && s.stream)
                    .map(s => s.stream))]
                    .sort();
                    
                classStreams.forEach(s => {
                    streamSelect.innerHTML += `<option value="${s}">${s}</option>`;
                });
            } else {
                 const currentStreams = [...new Set(SMS_DB.students?.map(s => s.stream))].filter(s => s).sort();
                 currentStreams.forEach(s => {
                    streamSelect.innerHTML += `<option value="${s}">${s}</option>`;
                });
            }
        }


        function showReportFilterModal(actionType, title, buttonText) {
            const currentClasses = [...new Set(SMS_DB.students?.map(s => s.class))].filter(c => c).sort();
            const classSelect = document.getElementById('export-class-select');
            const modalTitle = document.getElementById('export-modal-title');
            const submitButton = document.getElementById('export-submit-button');
            const streamContainer = document.getElementById('export-stream-container');
            
            document.getElementById('report-action-type').value = actionType;

            modalTitle.textContent = title;
            submitButton.textContent = buttonText;

            classSelect.innerHTML = '<option value="ALL">ALL CLASSES</option>';
            currentClasses.forEach(c => {
                classSelect.innerHTML += `<option value="${c}">${c}</option>`;
            });

            if (actionType === 'student_roster' || actionType === 'student_invoice_balances') { 
                streamContainer.style.display = 'block';
                updateStreamOptions(); 
            } else {
                streamContainer.style.display = 'none';
            }

            exportModal.classList.remove('hidden');
        }
        
        function handleReportSubmission(event) {
            event.preventDefault();
            const selectedClass = document.getElementById('export-class-select').value;
            const actionType = document.getElementById('report-action-type').value;
            
            let selectedStream = null;
            if (document.getElementById('export-stream-container').style.display !== 'none') {
                selectedStream = document.getElementById('export-stream-select').value;
            }
            
            if (!selectedClass) {
                alert("Please select a class filter.");
                return;
            }
            
            exportModal.classList.add('hidden');
            
            switch(actionType) {
                case 'student_roster':
                    exportStudentsRoster(selectedClass, selectedStream);
                    break;
                case 'balance_report':
                    generateStudentBalanceReport(selectedClass);
                    break;
                case 'status_report':
                    generateStudentStatusReport(selectedClass);
                    break;
                case 'leave_report':
                     generateActiveLeaveReport(selectedClass);
                    break;
                case 'student_invoice_balances':
                    generateStudentInvoiceBalancesDetailed(selectedClass, selectedStream);
                    break;
                default:
                    console.error("Unknown report action type:", actionType);
            }
        }

        function exportStudentsRoster(classFilter, streamFilter) {
            showLoading();
            let filteredStudents = SMS_DB.students || [];
            
            if (classFilter !== 'ALL') {
                filteredStudents = filteredStudents.filter(s => s.class === classFilter);
            }
            
            if (streamFilter !== 'ALL') {
                filteredStudents = filteredStudents.filter(s => s.stream === streamFilter);
            }

            filteredStudents.sort((a, b) => {
                if (a.class !== b.class) return a.class.localeCompare(b.class);
                if (a.stream !== b.stream) return a.stream.localeCompare(b.stream);
                return a.id.localeCompare(b.id);
            });

            const tableRows = filteredStudents.map(s => `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ccc;">${s.id}</td>
                    <td style="padding: 8px; border: 1px solid #ccc;">${s.name}</td>
                    <td style="padding: 8px; border: 1px solid #ccc;">${s.class} / ${s.stream}</td>
                    <td style="padding: 8px; border: 1px solid #ccc;">${formatDOB(s.dob)}</td>
                    <td style="padding: 8px; border: 1px solid #ccc;">${s.entryNo || 'N/A'}</td>
                    <td style="padding: 8px; border: 1px solid #ccc;">${s.fatherName || 'N/A'} (P: ${s.fatherPhone || 'N/A'})</td>
                </tr>
            `).join('');
            
            const classDisplay = classFilter === 'ALL' ? 'Complete' : classFilter;
            const streamDisplay = streamFilter === 'ALL' ? 'All Streams' : `Stream ${streamFilter}`;
            
            const title = `Student Roster for ${classDisplay} (${streamDisplay})`;

            const content = `
                <p style="font-size: 1.125rem; font-weight: bold; margin-bottom: 1rem;">
                    Total Students Exported: ${filteredStudents.length}
                </p>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead style="background-color: #e5e7eb;">
                        <tr>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Adm. No.</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Full Name</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Class / Stream</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">DOB</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Entry No.</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Primary Guardian</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `;
            
            showLoading(false);
            preparePrintLayout(title, content);
        }

        function handleLeaveSubmission(event) {
            event.preventDefault();
            const form = event.target;

            const newLeave = {
                id: generateUniqueId('L'),
                studentId: form['leave-student-id'].value, 
                type: form['leave-type'].value,
                reason: form['leave-reason'].value,
                departureDate: form['leave-departure'].value,
                expectedReturn: form['leave-return'].value,
                returnDate: null,
                status: 'Active',
                authorizedBy: form['leave-authorized'].value
            };
            
            if (!newLeave.studentId) {
                alert("Please select a valid student.");
                return;
            }

            if (new Date(newLeave.departureDate) > new Date(newLeave.expectedReturn)) {
                alert("Departure date cannot be after the expected return date.");
                return;
            }

            SMS_DB.leaves.push(newLeave);
            saveData();
            form.reset();
            document.getElementById('search-input-leave-student-id').value = '';
            document.getElementById('leave-student-id').value = '';
            
            navigate('leave');
        }

        function promptReturnLeave(leaveId) {
            const leaveIndex = SMS_DB.leaves.findIndex(l => l.id === leaveId);
            if (leaveIndex === -1) return;
            
            const leave = SMS_DB.leaves[leaveIndex];
            
            const today = new Date().toISOString().split('T')[0];
            const returnDate = prompt(`Enter actual return date (YYYY-MM-DD):`, today);
            
            if (returnDate) {
                if (new Date(returnDate) < new Date(leave.departureDate)) {
                    alert("Return date cannot be before departure date.");
                    return;
                }

                SMS_DB.leaves[leaveIndex].returnDate = returnDate;
                SMS_DB.leaves[leaveIndex].status = 'Returned';
                saveData();
                navigate('leave');
            }
        }


        function renderLeaveManagement() {
            pageTitle.textContent = "Student Leave and Out Management";
            
            const activeLeaves = SMS_DB.leaves?.filter(l => l.status === 'Active').map(l => {
                const student = SMS_DB.students.find(s => s.id === l.studentId);
                return { ...l, studentName: student?.name || 'Unknown Student', studentClass: student?.class || 'N/A' };
            }).sort((a, b) => new Date(a.expectedReturn) - new Date(b.expectedReturn));

            const historyLeaves = SMS_DB.leaves?.filter(l => l.status === 'Returned').map(l => {
                const student = SMS_DB.students.find(s => s.id === l.studentId);
                return { ...l, studentName: student?.name || 'Unknown Student' };
            }).sort((a, b) => new Date(b.departureDate) - new Date(a.departureDate)).slice(0, 10) || [];
            
            const searchableStudentSelect = createSearchableStudentSelect('leave-student-id');

            const activeRows = (activeLeaves || []).map(l => {
                const isOverdue = new Date(l.expectedReturn + 'T00:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
                return `
                    <tr class="hover:bg-yellow-50 border-b ${isOverdue ? 'bg-red-100' : 'bg-white'}">
                        <td class="px-4 py-3">${l.studentName} (${l.studentId})</td>
                        <td class="px-4 py-3">${l.type}</td>
                        <td class="px-4 py-3">${formatDate(l.departureDate)}</td>
                        <td class="px-4 py-3">${formatDate(l.expectedReturn)}</td>
                        <td class="px-4 py-3">${l.reason.substring(0, 30)}${l.reason.length > 30 ? '...' : ''}</td>
                        <td class="px-4 py-3">
                            <span class="font-bold text-${isOverdue ? 'red' : 'orange'}-600">${isOverdue ? 'OVERDUE' : l.status}</span>
                        </td>
                        <td class="px-4 py-3">
                            <div class="flex space-x-2">
                                <button onclick="promptReturnLeave('${l.id}')" class="text-green-600 hover:text-green-800 text-sm">Return</button>
                                <button onclick="generateLeaveSheet('${l.id}')" class="text-blue-600 hover:text-blue-800 text-sm">Sheet</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            const leaveManagementHTML = `
                <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div class="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg border h-fit">
                        <h3 class="text-xl font-semibold mb-4 text-blue-800 border-b pb-2">Approve New Leave/Out</h3>
                        <form id="leave-form" onsubmit="handleLeaveSubmission(event)">
                            <div class="space-y-3">
                                ${searchableStudentSelect}
                                <select id="leave-type" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                    <option value="">Leave Type</option>
                                    <option value="Medical">Medical Appointment</option>
                                    <option value="Home Leave">Official Home Leave</option>
                                    <option value="External Exam">External Exam/Activity</option>
                                </select>
                                <label class="block text-sm font-medium text-gray-700">Departure Date</label>
                                <input type="date" id="leave-departure" value="${new Date().toISOString().split('T')[0]}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                <label class="block text-sm font-medium text-gray-700">Expected Return Date</label>
                                <input type="date" id="leave-return" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                <textarea id="leave-reason" placeholder="Reason for leave" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"></textarea>
                                <input type="text" id="leave-authorized" placeholder="Authorized By" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                            </div>
                            <button type="submit" class="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-md">
                                Approve Departure
                            </button>
                        </form>
                    </div>

                    <div class="lg:col-span-3">
                        <div class="bg-white p-6 rounded-xl shadow-lg">
                            <h3 class="text-xl font-semibold mb-4 text-gray-800">Active / Pending Returns (${activeLeaves?.length || 0})</h3>
                            <div class="overflow-x-auto max-h-[500px] custom-scroll border rounded-lg">
                                <table class="min-w-full divide-y divide-gray-200">
                                    <thead class="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Departed</th>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected Return</th>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-200">
                                        ${activeRows || `<tr><td colspan="7" class="text-center py-4 text-gray-500">No students are currently on leave.</td></tr>`}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <div class="bg-white p-6 rounded-xl shadow-lg mt-6">
                            <h3 class="text-xl font-semibold mb-4 text-gray-800">Recent Leave History (Last 10)</h3>
                             <div class="overflow-x-auto border rounded-lg">
                                <table class="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead class="bg-gray-50">
                                        <tr>
                                            <th class="px-4 py-2 text-left text-xs text-gray-500 uppercase">Student</th>
                                            <th class="px-4 py-2 text-left text-xs text-gray-500 uppercase">Type</th>
                                            <th class="px-4 py-2 text-left text-xs text-gray-500 uppercase">Departed</th>
                                            <th class="px-4 py-2 text-left text-xs text-gray-500 uppercase">Returned</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-200">
                                        ${historyLeaves.map(l => `
                                            <tr>
                                                <td class="px-4 py-2">${l.studentName}</td>
                                                <td class="px-4 py-2">${l.type}</td>
                                                <td class="px-4 py-2">${formatDate(l.departureDate)}</td>
                                                <td class="px-4 py-2 text-green-600">${formatDate(l.returnDate)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            contentContainer.innerHTML = leaveManagementHTML;
        }

        function generateLeaveSheet(leaveId) {
            showLoading();
            const leave = SMS_DB.leaves.find(l => l.id === leaveId);
            const student = SMS_DB.students.find(s => s.id === leave.studentId);
            
            if (!leave || !student) {
                alert("Leave or student record not found.");
                showLoading(false);
                return;
            }

            const dobDisplay = formatDOB(student.dob);
            const departureDate = formatDate(leave.departureDate);
            const expectedReturn = formatDate(leave.expectedReturn);

            const sheetContent = `
                <div class="print-sheet" style="border: 2px solid #000; padding: 25px; margin-top: 20px;">
                    <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 15px; text-align: center; color: #1e40af;">SCHOOL LEAVE AUTHORIZATION SHEET</h2>
                    <p style="text-align: right; font-size: 12px; margin-bottom: 20px;">Sheet ID: ${leave.id}</p>
                    
                    <div style="border: 1px solid #ccc; padding: 15px; margin-bottom: 15px;">
                        <h3 style="font-weight: bold; margin-bottom: 10px; border-bottom: 1px dashed #ddd;">Student Details:</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <p><strong>Name:</strong> ${student.name}</p>
                            <p><strong>Admission No:</strong> ${student.id}</p>
                            <p><strong>Class:</strong> ${student.class} / ${student.stream}</p>
                            <p><strong>Date of Birth:</strong> ${dobDisplay}</p>
                            <p><strong>Entry No:</strong> ${student.entryNo || 'N/A'}</p>
                            <p><strong>Assessment No:</strong> ${student.assessmentNo || 'N/A'}</p>
                        </div>
                    </div>

                    <div style="border: 1px solid #ccc; padding: 15px; margin-bottom: 20px;">
                        <h3 style="font-weight: bold; margin-bottom: 10px; border-bottom: 1px dashed #ddd;">Leave Details:</h3>
                        <p><strong>Type of Leave:</strong> ${leave.type}</p>
                        <p><strong>Reason:</strong> ${leave.reason}</p>
                        <p><strong>Departure Date:</strong> ${departureDate}</p>
                        <p><strong>Expected Return Date:</strong> ${expectedReturn}</p>
                        <p style="margin-top: 10px;"><strong>Authorized By:</strong> ${leave.authorizedBy}</p>
                    </div>

                    <div style="border: 1px solid #ccc; padding: 15px; margin-bottom: 20px;">
                        <h3 style="font-weight: bold; margin-bottom: 10px; border-bottom: 1px dashed #ddd;">Parent/Guardian Contact Confirmation:</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <p><strong>Father/Guardian Name:</strong> ${student.fatherName || 'N/A'}</p>
                            <p><strong>Father/Guardian ID:</strong> ${student.fatherId || 'N/A'}</p>
                            <p><strong>Father/Guardian Phone:</strong> ${student.fatherPhone || 'N/A'}</p>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <p><strong>Mother/Guardian Name:</strong> ${student.motherName || 'N/A'}</p>
                            <p><strong>Mother/Guardian ID:</strong> ${student.motherId || 'N/A'}</p>
                            <p><strong>Mother/Guardian Phone:</strong> ${student.motherPhone || 'N/A'}</p>
                        </div>
                    </div>

                    <p style="font-weight: bold; margin-top: 25px; padding-top: 10px; border-top: 1px solid #000;">
                        Guardian Signature: _________________________
                    </p>
                     <p style="font-weight: bold; margin-top: 15px;">
                        Date Returned (Official Use): _________________________
                    </p>
                </div>
            `;

            showLoading(false);
            preparePrintLayout("Student Leave Out Sheet", sheetContent);
        }

        function getPerformanceBand(average) {
            if (average >= 90) return { band: 'EE1 (Exceptional performance)', color: 'bg-blue-800', text: 'EE1' };
            if (average >= 75) return { band: 'EE2 (Very good performance)', color: 'bg-green-600', text: 'EE2' };
            if (average >= 58) return { band: 'ME1 (Good performance)', color: 'bg-green-500', text: 'ME1' };
            if (average >= 41) return { band: 'ME2 (Fair performance)', color: 'bg-yellow-600', text: 'ME2' };
            if (average >= 31) return { band: 'AE1 (Needs improvement)', color: 'bg-yellow-500', text: 'AE1' };
            if (average >= 21) return { band: 'AE2 (Below average performance)', color: 'bg-orange-500', text: 'AE2' };
            if (average >= 11) return { band: 'BE1 (Well below average performance)', color: 'bg-red-600', text: 'BE1' };
            if (average >= 1) return { band: 'BE2 (Minimal performance)', color: 'bg-red-500', text: 'BE2' };
            return { band: 'FAIL (0%)', color: 'bg-gray-700', text: 'FAIL' };
        }


        function loadGradebookData() {
            studentScores = SMS_DB.gradebookData.scores || {}; 

            const termSelect = document.getElementById('term');
            if (termSelect) {
                termSelect.value = SMS_DB.gradebookData.term || GRADING_TERMS[0];
                termSelect.onchange = () => {
                    SMS_DB.gradebookData.term = termSelect.value;
                    saveData();
                };
            }
        }

        function saveGradebookData() {
            SMS_DB.gradebookData.scores = studentScores;
            const termElement = document.getElementById('term');
            if (termElement) {
                SMS_DB.gradebookData.term = termElement.value;
            }
            saveData();
        }


        function mergeAllCSVs() {
            showLoading(true);
            studentScores = {}; 
            const subjects = ["Math", "English", "Kiswahili", "Integrated", "Pretechnical", "AGRI", "CA", "CRE", "SS"];
            const files = subjects
                .map(s => ({ subject: s, file: document.getElementById(s).files[0] }))
                .filter(item => item.file);

            if (files.length === 0) {
                alert("Please upload at least one subject CSV file.");
                showLoading(false);
                return;
            }
            
            let filesLoaded = 0;

            files.forEach(({ subject, file }) => {
                const reader = new FileReader();

                reader.onload = function (e) {
                    const rows = e.target.result.split('\n');
                    rows.slice(1).forEach(row => {
                        const cols = robustCSVSplit(row);
                        
                        if (cols.length < 6) return; 
                        
                        const [adm, name, level, stream, sub, scoreStr] = cols.map(c => c.trim());
                        const score = parseFloat(scoreStr);

                        if (!adm || !name || isNaN(score)) return;

                        if (!studentScores[adm]) {
                            const studentMeta = SMS_DB.students.find(s => s.id === adm) || { name: name, class: level, stream: stream };

                            studentScores[adm] = { 
                                name: studentMeta.name, 
                                level: studentMeta.class, 
                                stream: studentMeta.stream, 
                                scores: {}, 
                                total: 0, 
                                average: 0 
                            };
                        }
                        studentScores[adm].scores[subject] = score;
                    });

                    filesLoaded++;
                    if (filesLoaded === files.length) {
                        generateRanking();
                        saveGradebookData(); 
                        showLoading(false);
                    }
                };

                reader.readAsText(file);
            });
        }

        function generateRanking() {
            const table = document.getElementById('rankingTable');
            const tbody = document.getElementById('rankingTableBody');
            if (!tbody) { 
                return;
            }
            tbody.innerHTML = "";
            const numSubjects = 9; 

            let ranked = Object.entries(studentScores).map(([adm, data]) => {
                const scores = Object.values(data.scores);
                const currentSubjectsCount = scores.length;
                
                const total = scores.reduce((a, b) => a + b, 0);
                // Calculate average based on 9 subjects, even if not all subjects have scores
                // This ensures consistency in ranking, treating missing scores as 0 for average
                const average = total / numSubjects; 
                
                data.total = total;
                data.average = average;
                
                const performance = getPerformanceBand(average);
                
                return { adm, name: data.name, stream: data.stream, total, average, performance, subjects: data.scores, currentSubjectsCount };
            }).filter(s => s.currentSubjectsCount > 0); 

            ranked.sort((a, b) => b.average - a.average);

            ranked.forEach((student, index) => {
                const tr = document.createElement("tr");
                const subjectList = Object.entries(student.subjects).map(([sub, score]) => `<span class="whitespace-nowrap">${sub}: ${score}</span>`).join('<br>');
                
                tr.className = "hover:bg-gray-50";
                tr.innerHTML = `
                    <td class="px-3 py-2 text-center">${index + 1}</td>
                    <td class="px-3 py-2 font-medium">${student.adm}</td>
                    <td class="px-3 py-2">${student.name}</td>
                    <td class="px-3 py-2">${student.stream}</td>
                    <td class="px-3 py-2 font-bold">${student.total.toFixed(2)}</td>
                    <td class="px-3 py-2">${student.average.toFixed(2)}</td>
                    <td class="px-3 py-2"><span class="px-2 py-1 rounded text-white text-xs font-semibold ${student.performance.color}">${student.performance.text}</span></td>
                    <td class="px-3 py-2 text-xs">${subjectList}</td>
                    <td class="px-3 py-2"><button onclick="downloadReport('${student.adm}')" class="bg-indigo-500 hover:bg-indigo-600 text-white p-2 rounded-lg text-xs">📄 Download PDF</button></td>
                    <td class="px-3 py-2"><button onclick="editStudent('${student.adm}')" class="bg-yellow-500 hover:bg-yellow-600 text-white p-2 rounded-lg text-xs">✏️ Edit</button></td>
                `;
                tbody.appendChild(tr);
            });

            table.classList.remove('hidden');

            let btn = document.getElementById("downloadRankedBtn");
            if (!btn && ranked.length > 0) {
                const btnContainer = document.getElementById("gradebook-container");
                if (btnContainer) {
                    btn = document.createElement("button");
                    btn.textContent = "⬇️ Download Overall Ranked Results (CSV)";
                    btn.id = "downloadRankedBtn";
                    btn.className = "report-btn bg-green-600 hover:bg-green-700 mt-4";
                    btn.onclick = downloadOverallRankedCSV;
                    btnContainer.appendChild(btn);
                }
            } else if (btn) {
                 btn.classList.toggle('hidden', ranked.length === 0);
            }
        }

        function editStudent(adm) {
            const student = studentScores[adm];
            if (!student) return;
            
            const newScores = { ...student.scores }; 
            let changesMade = false;

            for (let subject in student.scores) {
                let currentVal = student.scores[subject];
                let newVal = prompt(`Edit score for ${subject} (${student.name}, Adm: ${adm}):`, currentVal);
                
                if (newVal !== null) {
                    const parsedVal = parseFloat(newVal);
                    if (!isNaN(parsedVal) && parsedVal >=0 && parsedVal <=100 && parsedVal !== currentVal) {
                        newScores[subject] = parsedVal;
                        changesMade = true;
                    } else if (parsedVal < 0 || parsedVal > 100) {
                        alert("Score must be between 0 and 100.");
                    } else if (isNaN(parsedVal)) {
                        alert("Invalid input. Please enter a number.");
                    }
                }
            }
            
            if (changesMade) {
                studentScores[adm].scores = newScores;
                generateRanking();
                saveGradebookData();
            }
        }

        async function downloadReport(adm) {
            showLoading(true);
            try {
                const student = studentScores[adm];
                if (!student) {
                    alert("Student data not found.");
                    return;
                }

                if (!window.jspdf || !window.jspdf.jsPDF) {
                    alert("The PDF generator is not loaded. Please make sure the computer is connected to the internet, then reload the system.");
                    return;
                }

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
                const W = 210, H = 297;
                const M = 14;
                const term = document.getElementById("term")?.value || "N/A";
                const year = SMS_DB.settings?.currentYear || new Date().getFullYear();
                const performance = getPerformanceBand(Number(student.average) || 0);
                const scores = Object.entries(student.scores || {});
                const currentRankingData = Object.entries(studentScores)
                    .map(([a, data]) => ({ adm: a, average: Number(data.average) || 0 }))
                    .sort((a, b) => b.average - a.average);
                const rankIndex = currentRankingData.findIndex(r => String(r.adm) === String(adm));
                const rank = rankIndex >= 0 ? rankIndex + 1 : "N/A";

                // Professional A4 report-card header
                doc.setFillColor(15, 61, 145);
                doc.rect(0, 0, W, 30, "F");
                if (SCHOOL_PROFILE.logo) {
                    try { doc.addImage(SCHOOL_PROFILE.logo, "PNG", M, 5, 20, 20); } catch (e) {}
                }
                doc.setTextColor(255,255,255);
                doc.setFont("helvetica","bold");
                doc.setFontSize(16);
                doc.text(String(SCHOOL_NAME || "SCHOOL").toUpperCase(), W/2, 11, {align:"center"});
                doc.setFontSize(10);
                doc.setFont("helvetica","normal");
                doc.text("STUDENT REPORT CARD", W/2, 18, {align:"center"});
                doc.setFontSize(7.5);
                const contact = [SCHOOL_PROFILE.address, SCHOOL_PROFILE.phone, SCHOOL_PROFILE.email].filter(Boolean).join("  |  ");
                if (contact) doc.text(contact, W/2, 24, {align:"center"});

                // Student information
                let y = 39;
                doc.setTextColor(25,35,55);
                doc.setFont("helvetica","bold");
                doc.setFontSize(11);
                doc.text("LEARNER INFORMATION", M, y);
                doc.setDrawColor(15,61,145);
                doc.line(M, y+2, W-M, y+2);

                y += 10;
                doc.setFontSize(9);
                doc.setFont("helvetica","normal");
                const info = [
                    [`Learner Name: ${student.name || "N/A"}`, `Admission No.: ${adm}`],
                    [`Class / Stream: ${student.level || "N/A"} / ${student.stream || "N/A"}`, `Term: ${term}`],
                    [`Academic Year: ${year}`, `Overall Rank: ${rank}`]
                ];
                info.forEach(row => {
                    doc.setFont("helvetica","bold");
                    doc.text(row[0], M, y);
                    doc.text(row[1], 108, y);
                    y += 6;
                });

                // Subject performance table (manual A4-safe table; no AutoTable dependency)
                y += 3;
                doc.setFont("helvetica","bold");
                doc.setFontSize(11);
                doc.text("SUBJECT PERFORMANCE", M, y);
                y += 5;

                const col = [M, 105, 133, 161, W-M];
                const rowH = 7;
                doc.setFillColor(15,61,145);
                doc.rect(M, y, W-2*M, rowH, "F");
                doc.setTextColor(255,255,255);
                doc.setFontSize(8);
                doc.text("SUBJECT", col[0]+2, y+4.8);
                doc.text("SCORE", col[1]+2, y+4.8);
                doc.text("MAX", col[2]+2, y+4.8);
                doc.text("PERCENT", col[3]+2, y+4.8);
                y += rowH;

                doc.setFont("helvetica","normal");
                doc.setTextColor(30,30,30);
                scores.forEach(([sub, rawScore], i) => {
                    const score = Number(rawScore) || 0;
                    const max = 100;
                    const pct = score;
                    if (y > 260) return;
                    if (i % 2 === 0) {
                        doc.setFillColor(245,248,252);
                        doc.rect(M, y, W-2*M, rowH, "F");
                    }
                    doc.setDrawColor(210,215,225);
                    doc.rect(M, y, W-2*M, rowH);
                    doc.line(col[1], y, col[1], y+rowH);
                    doc.line(col[2], y, col[2], y+rowH);
                    doc.line(col[3], y, col[3], y+rowH);
                    doc.text(String(sub).slice(0,42), col[0]+2, y+4.8);
                    doc.text(score.toFixed(1), col[1]+2, y+4.8);
                    doc.text(String(max), col[2]+2, y+4.8);
                    doc.text(pct.toFixed(1)+"%", col[3]+2, y+4.8);
                    y += rowH;
                });

                // Summary
                y += 7;
                doc.setFont("helvetica","bold");
                doc.setFontSize(10);
                doc.text(`TOTAL MARKS: ${(Number(student.total)||0).toFixed(2)}`, M, y);
                doc.text(`AVERAGE: ${(Number(student.average)||0).toFixed(2)}%`, 75, y);
                doc.text(`PERFORMANCE: ${performance.band} - ${performance.text}`, 130, y);
                y += 10;
                doc.setFontSize(9);
                doc.setFont("helvetica","normal");
                doc.text(`Overall position: ${rank}`, M, y);

                // Simple graphical analysis drawn directly in PDF (does not require Chart.js)
                y += 9;
                doc.setFont("helvetica","bold");
                doc.setFontSize(11);
                doc.text("GRAPHICAL ANALYSIS", M, y);
                y += 6;

                const chartX = M, chartY = y, chartW = W-2*M, chartH = 55;
                doc.setDrawColor(190,198,210);
                doc.rect(chartX, chartY, chartW, chartH);
                const barAreaX = chartX + 5, barAreaY = chartY + 5;
                const usableW = chartW - 10;
                const usableH = chartH - 13;
                const count = Math.max(scores.length, 1);
                const gap = 2;
                const bw = Math.max(3, (usableW - gap*(count-1))/count);

                scores.forEach(([sub, rawScore], i) => {
                    const score = Math.max(0, Math.min(100, Number(rawScore)||0));
                    const bh = usableH * score/100;
                    const bx = barAreaX + i*(bw+gap);
                    const by = barAreaY + usableH - bh;
                    doc.setFillColor(37,99,235);
                    doc.rect(bx, by, bw, bh, "F");
                    doc.setTextColor(45,55,72);
                    doc.setFontSize(5.5);
                    doc.text(String(sub).slice(0,10), bx+bw/2, barAreaY+usableH+5, {align:"center", angle:45});
                });
                doc.setFontSize(6);
                doc.setTextColor(100,110,125);
                doc.text("100%", chartX+1, chartY+5);
                doc.text("0%", chartX+2, chartY+chartH-2);

                // Remarks and signatures
                y = chartY + chartH + 16;
                doc.setTextColor(30,30,30);
                doc.setFont("helvetica","bold");
                doc.setFontSize(9);
                doc.text("TEACHER'S REMARKS", M, y);
                doc.line(M, y+3, W-M, y+3);
                doc.line(M, y+9, W-M, y+9);

                doc.setFont("helvetica","normal");
                doc.text("Class Teacher: ________________________________", M, y+20);
                doc.text("Parent / Guardian: ____________________________", 108, y+20);
                doc.text("Date: __________________", M, y+28);

                // Footer branding
                doc.setDrawColor(15,61,145);
                doc.line(M, H-15, W-M, H-15);
                doc.setFontSize(7);
                doc.setTextColor(90,100,115);
                doc.text("Powered by RONO MANAGEMENT SYSTEM", M, H-10);
                doc.text("Professional A4 Student Report Card", W-M, H-10, {align:"right"});

                const safeName = String(student.name || "Student").replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"");
                const safeTerm = String(term).replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"");
                doc.save(`${safeName || "Student"}_${safeTerm || "Term"}_A4_Report_Card.pdf`);
            } catch (error) {
                console.error("Report card generation failed:", error);
                alert("The A4 report card could not be downloaded. Please reload the system and try again.");
            } finally {
                showLoading(false);
            }
        }

        function downloadOverallRankedCSV() {
            let csv = "Rank,Admission,Name,Stream,Total,Average,PerformanceBand,Subjects\n";
            let ranked = Object.entries(studentScores).map(([adm, data]) => {
                const total = data.total;
                const average = data.average;
                const performance = getPerformanceBand(average);
                const subjects = Object.entries(data.scores).map(([sub, score]) => `${sub}: ${score}`).join(' | ');
                return { adm, name: data.name, stream: data.stream, total, average, performance: performance.text, subjects };
            });

            ranked.sort((a, b) => b.average - a.average);

            ranked.forEach((student, index) => {
                csv += `${index + 1},${student.adm},"${student.name}","${student.stream}",${student.total.toFixed(2)},${student.average.toFixed(2)},"${student.performance}","${student.subjects}"\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "Mabasi_Overall_Ranked_Results.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        function resetSystem() {
            if (confirm("Are you sure you want to reset the Gradebook system? All uploaded scores for this term will be cleared from local storage.")) {
                studentScores = {};
                SMS_DB.gradebookData.scores = {};
                saveData();
                navigate('gradebook'); 
            }
        }

        // ===================== EXAM ANALYZER =====================
        let examAnalyzerSyncTimer = null;
        let examAnalyzerEditing = false;

        function examAnalyzerDefaultBands() {
            return [
                {min:90,max:100,grade:'EE1',label:'Exceptional'},
                {min:75,max:89.99,grade:'EE2',label:'Very Good'},
                {min:58,max:74.99,grade:'ME1',label:'Good'},
                {min:41,max:57.99,grade:'ME2',label:'Fair'},
                {min:31,max:40.99,grade:'AE1',label:'Approaching'},
                {min:21,max:30.99,grade:'AE2',label:'Below Expected'},
                {min:11,max:20.99,grade:'BE1',label:'Below'},
                {min:0,max:10.99,grade:'BE2',label:'Minimal'}
            ];
        }

        function ensureExamAnalyzerData() {
            if (!SMS_DB.gradebookData || typeof SMS_DB.gradebookData !== 'object') SMS_DB.gradebookData = {};
            const g = SMS_DB.gradebookData;
            g.version = 3;
            g.teachers = Array.isArray(g.teachers) ? g.teachers : [];
            g.exams = Array.isArray(g.exams) ? g.exams : [];
            g.bands = Array.isArray(g.bands) && g.bands.length ? g.bands : examAnalyzerDefaultBands();
            g.activeExamId = g.activeExamId || null;
            if (!g.exams.length && g.scores && Object.keys(g.scores).length) {
                const subjects = Array.from(new Set(Object.values(g.scores).flatMap(x => Object.keys(x.scores || {}))));
                const ex = {
                    id: 'EX-'+Date.now(), name:'Imported Grade Book', term:g.term || GRADING_TERMS[0], year:SMS_DB.settings?.currentYear || new Date().getFullYear(),
                    classFilter:'ALL', streamFilter:'ALL', subjects:subjects.map((name,i)=>({id:'SUB-'+i,name,max:100})), marks:{}, teachers:{}, comments:{}
                };
                Object.entries(g.scores).forEach(([sid,row])=>{
                    ex.marks[sid]={};
                    Object.entries(row.scores||{}).forEach(([name,score])=>{ const sub=ex.subjects.find(x=>x.name===name); if(sub) ex.marks[sid][sub.id]=Number(score); });
                });
                g.exams.push(ex); g.activeExamId=ex.id;
            }
            if (!g.exams.length) {
                const subjects=(SMS_DB.subjects||[]).map((s,i)=>({id:s.id||('SUB-'+i),name:s.name,max:Number(s.max||100)}));
                const ex={id:'EX-'+Date.now(),name:'Term Assessment',term:SMS_DB.settings?.currentTerm||GRADING_TERMS[0],year:SMS_DB.settings?.currentYear||new Date().getFullYear(),classFilter:'ALL',streamFilter:'ALL',subjects,marks:{},teachers:{},comments:{}};
                g.exams.push(ex); g.activeExamId=ex.id;
            }
            if (!g.activeExamId || !g.exams.some(e=>e.id===g.activeExamId)) g.activeExamId=g.exams[0].id;
            return g;
        }

        function examAnalyzerCurrent() { const g=ensureExamAnalyzerData(); return g.exams.find(e=>e.id===g.activeExamId)||g.exams[0]; }
        function examAnalyzerGrade(avg) { const b=ensureExamAnalyzerData().bands.find(x=>avg>=Number(x.min)&&avg<=Number(x.max)); return b || {grade:'—',label:'No grade'}; }
        function examAnalyzerRankRows(rows) {
            const ranked=[...rows].filter(r=>r.count>0).sort((a,b)=>b.avg-a.avg || b.total-a.total || a.student.name.localeCompare(b.student.name));
            const rankMap=new Map(); let previous=null, rank=0;
            ranked.forEach((r,i)=>{ const key=Number(r.avg.toFixed(4)); if(key!==previous) rank=i+1; rankMap.set(r.student.id,rank); previous=key; });
            return {ranked,rankMap};
        }
        function examAnalyzerStudents(exam, useUIFilters=true) {
            const cf=useUIFilters ? (document.getElementById('ea-class-filter')?.value || exam.classFilter || 'ALL') : (exam.classFilter || 'ALL');
            const sf=useUIFilters ? (document.getElementById('ea-stream-filter')?.value || exam.streamFilter || 'ALL') : (exam.streamFilter || 'ALL');
            return (SMS_DB.students||[]).filter(s=>(cf==='ALL'||s.class===cf)&&(sf==='ALL'||s.stream===sf));
        }
        function examAnalyzerRows(exam, useUIFilters=true) {
            return examAnalyzerStudents(exam,useUIFilters).map(s=>{
                const scores=exam.marks?.[s.id]||{};
                const vals=exam.subjects.map(sub=>Number(scores[sub.id])).filter(v=>Number.isFinite(v));
                const total=vals.reduce((a,b)=>a+b,0), max=exam.subjects.reduce((a,b)=>a+Number(b.max||100),0);
                const avg=max?total/max*100:0;
                return {student:s,scores,total,max,avg,grade:examAnalyzerGrade(avg),count:vals.length};
            });
        }
        function examAnalyzerSaveLocal() {
            const g=ensureExamAnalyzerData(); g.updatedAt=Date.now();
            examAnalyzerEditing=false;
            saveData();
        }
        async function examAnalyzerLoadServer() {
            try {
                const d=await apiFetch('/api/exam-analyzer');
                if(d.value) {
                    const remote=JSON.parse(d.value);
                    const local=ensureExamAnalyzerData();
                    if(!local.updatedAt || Number(remote.updatedAt||0)>Number(local.updatedAt||0)) {
                        SMS_DB.gradebookData=remote; examAnalyzerEditing=false; renderGradebook(false);
                    }
                }
            } catch(e) { console.warn('Exam Analyzer live sync:',e.message); }
        }
        async function examAnalyzerSaveServer() {
            try {
                const g=ensureExamAnalyzerData(); g.updatedAt=Date.now();
                await apiFetch('/api/exam-analyzer',{method:'POST',body:JSON.stringify({value:JSON.stringify(g)})});
                examAnalyzerEditing=false;
            } catch(e) { alert('Unable to save Exam Analyzer: '+e.message); }
        }
        async function examAnalyzerSave() { examAnalyzerSaveLocal(); await examAnalyzerSaveServer(); renderGradebook(false); }
        function examAnalyzerStartSync() {
            if(examAnalyzerSyncTimer) clearInterval(examAnalyzerSyncTimer);
            examAnalyzerSyncTimer=setInterval(()=>{ if(!examAnalyzerEditing) examAnalyzerLoadServer(); },5000);
        }
        function examAnalyzerStopSync() { if(examAnalyzerSyncTimer){clearInterval(examAnalyzerSyncTimer);examAnalyzerSyncTimer=null;} }
        function eaEsc(v){return escapeHtml(v);}
        function eaSubjectsFromMain(){return (SMS_DB.subjects||[]).map((s,i)=>({id:s.id||'SUB-'+i,name:s.name,max:Number(s.max||100)}));}
        function eaEnsureTeacherData(){
            const g=ensureExamAnalyzerData();
            g.teachers=Array.isArray(g.teachers)?g.teachers:[];
            const ex=examAnalyzerCurrent();
            ex.teachers=ex.teachers&&typeof ex.teachers==='object'?ex.teachers:{};
            ex.comments=ex.comments&&typeof ex.comments==='object'?ex.comments:{};
            return {g,ex};
        }
        function eaTeacherForSubject(subjectId){
            const {g,ex}=eaEnsureTeacherData();
            const tid=ex.teachers[subjectId];
            return g.teachers.find(t=>t.id===tid)||null;
        }
        function eaTeacherName(subjectId){ return eaTeacherForSubject(subjectId)?.name || 'Not assigned'; }
        function eaAddTeacher(){
            const {g}=eaEnsureTeacherData();
            const name=prompt('Teacher full name:',''); if(!name||!name.trim()) return;
            const subjects=prompt('Teaching subjects (comma separated):','');
            const selected=(subjects||'').split(',').map(x=>x.trim()).filter(Boolean);
            const teacher={id:'TCH-'+Date.now(),name:name.trim(),subjects:selected};
            g.teachers.push(teacher);
            examAnalyzerSave();
        }
        function eaDeleteTeacher(id){
            const {g}=eaEnsureTeacherData(); if(!confirm('Remove this teacher assignment?'))return;
            g.teachers=g.teachers.filter(t=>t.id!==id);
            examAnalyzerSave();
        }
        function eaAssignTeacher(subjectId,teacherId){
            const {ex}=eaEnsureTeacherData(); ex.teachers[subjectId]=teacherId||''; examAnalyzerEditing=true; examAnalyzerSave();
        }
        function eaSetSubjectComment(studentId,subjectId,value){
            const {ex}=eaEnsureTeacherData(); ex.comments[studentId]=ex.comments[studentId]||{};
            ex.comments[studentId][subjectId]=String(value||'').trim(); examAnalyzerEditing=true;
        }
        function eaDefaultSubjectComment(score, max){
            const pct=Number(max)>0 && Number.isFinite(Number(score)) ? Number(score)/Number(max)*100 : null;
            if(pct===null) return 'No mark entered';
            const band=examAnalyzerGrade(pct);
            const comments={
                EE1:'Exceptional performance',
                EE2:'Excellent performance',
                ME1:'Good performance',
                ME2:'Fair performance',
                AE1:'Approaching expectations',
                AE2:'Below expected level',
                BE1:'Needs considerable improvement',
                BE2:'Requires significant support'
            };
            return `${band.grade}, ${comments[band.grade]||band.label}`;
        }
        function eaSubjectComment(studentId,subjectId){
            const {ex}=eaEnsureTeacherData();
            const stored=ex.comments?.[studentId]?.[subjectId];
            if(stored && String(stored).trim()) return String(stored).trim();
            const row=examAnalyzerRows(ex,false).find(r=>r.student.id===studentId);
            const subject=ex.subjects.find(x=>x.id===subjectId);
            return eaDefaultSubjectComment(row?.scores?.[subjectId],subject?.max);
        }
        // System-generated class teacher comments: selected automatically from the CBC achievement level.
        // No manual typing is required when producing learner reports.
        function eaClassTeacherComment(row){
            const pct=Number(row?.avg||0);
            const comments=[
                {min:90,text:'Excellent overall performance. Keep up the outstanding effort and continue developing your strengths.'},
                {min:80,text:'Very good overall performance. Maintain the positive learning habits and continue striving for higher achievement.'},
                {min:70,text:'Good overall performance. Continue working consistently and strengthen areas that need further improvement.'},
                {min:60,text:'Satisfactory overall performance. More practice, concentration and consistent revision will support further progress.'},
                {min:50,text:'Fair overall performance. The learner should put more effort into revision and seek support in challenging areas.'},
                {min:41,text:'The learner is making progress. Regular practice, closer guidance and consistent effort are recommended.'},
                {min:0,text:'The learner requires additional support. Close guidance, regular practice and follow-up are recommended.'}
            ];
            return (comments.find(c=>pct>=c.min)||comments[comments.length-1]).text;
        }
        function eaEditComment(studentId,subjectId){
            const current=eaSubjectComment(studentId,subjectId), subject=examAnalyzerCurrent().subjects.find(x=>x.id===subjectId);
            const v=prompt(`Teacher comment for ${subject?.name||'subject'}:`,current); if(v===null)return; eaSetSubjectComment(studentId,subjectId,v); examAnalyzerSave();
        }
        function eaTeacherPanel(){
            const {g,ex}=eaEnsureTeacherData();
            const teacherRows=g.teachers.map(t=>`<tr class="border-b"><td class="p-2 font-semibold">${eaEsc(t.name)}</td><td class="p-2">${eaEsc(t.subjects.join(', ')||'—')}</td><td class="p-2">${ex.subjects.filter(s=>t.subjects.some(x=>x.toLowerCase()===s.name.toLowerCase())).map(s=>eaEsc(s.name)).join(', ')||'—'}</td><td class="p-2"><button onclick="eaDeleteTeacher('${t.id}')" class="text-red-600">Remove</button></td></tr>`).join('');
            const assigns=ex.subjects.map(sub=>`<div class="flex items-center gap-2 border rounded-lg p-2 bg-white"><span class="font-semibold flex-1">${eaEsc(sub.name)}</span><select onchange="eaAssignTeacher('${sub.id}',this.value)" class="border rounded p-2"><option value="">Not assigned</option>${g.teachers.map(t=>`<option value="${t.id}" ${ex.teachers[sub.id]===t.id?'selected':''}>${eaEsc(t.name)}</option>`).join('')}</select></div>`).join('');
            return `<div class="bg-white rounded-xl shadow p-5 border"><div class="flex justify-between items-center mb-3"><div><h3 class="text-xl font-bold">👩‍🏫 Teachers & Subject Assignment</h3><p class="text-sm text-gray-500">Enter teachers and assign each subject. The assigned teacher automatically appears on learner report cards.</p></div><button onclick="eaAddTeacher()" class="bg-blue-700 text-white px-4 py-2 rounded-lg">+ Add Teacher</button></div><div class="overflow-x-auto mb-5"><table class="min-w-full text-sm"><thead class="bg-gray-100"><tr><th class="p-2 text-left">Teacher</th><th class="p-2 text-left">Teaching Subjects</th><th class="p-2 text-left">Matched Exam Subjects</th><th class="p-2">Action</th></tr></thead><tbody>${teacherRows||'<tr><td colspan="4" class="p-4 text-center text-gray-500">No teachers entered yet.</td></tr>'}</tbody></table></div><h4 class="font-bold mb-2">Assign Exam Subjects</h4><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">${assigns}</div></div>`;
        }

        function eaCreateExam(){
            const g=ensureExamAnalyzerData(), name=prompt('Exam name (e.g. End Term 2 Exam):','End Term Examination'); if(!name) return;
            const ex={id:'EX-'+Date.now(),name:name.trim(),term:SMS_DB.settings?.currentTerm||GRADING_TERMS[0],year:SMS_DB.settings?.currentYear||new Date().getFullYear(),classFilter:'ALL',streamFilter:'ALL',subjects:eaSubjectsFromMain(),marks:{},teachers:{},comments:{}};
            g.exams.push(ex); g.activeExamId=ex.id; examAnalyzerSave();
        }
        function eaDeleteExam(){
            const g=ensureExamAnalyzerData(), ex=examAnalyzerCurrent(); if(g.exams.length<=1){alert('Keep at least one exam.');return;}
            if(!confirm('Delete '+ex.name+' and all its marks?')) return; g.exams=g.exams.filter(x=>x.id!==ex.id); g.activeExamId=g.exams[0].id; examAnalyzerSave();
        }
        function eaSelectExam(id){ const g=ensureExamAnalyzerData(); g.activeExamId=id; examAnalyzerEditing=true; examAnalyzerSave(); }
        function eaNewSubject(){
            const ex=examAnalyzerCurrent(), name=prompt('Subject name:'); if(!name) return; const max=Number(prompt('Maximum mark:','100')); if(!Number.isFinite(max)||max<=0)return;
            ex.subjects.push({id:'SUB-'+Date.now(),name:name.trim(),max}); examAnalyzerSave();
        }
        function eaRemoveSubject(id){ const ex=examAnalyzerCurrent(); if(!confirm('Remove this subject and its marks from this exam?'))return; ex.subjects=ex.subjects.filter(s=>s.id!==id); Object.values(ex.marks||{}).forEach(m=>delete m[id]); examAnalyzerSave(); }
        function eaSetMark(studentId,subjectId,value){
            const ex=examAnalyzerCurrent(); ex.marks=ex.marks||{}; ex.marks[studentId]=ex.marks[studentId]||{};
            if(value===''||value===null) delete ex.marks[studentId][subjectId]; else { const n=Number(value); if(Number.isFinite(n)) ex.marks[studentId][subjectId]=Math.max(0,n); }
            examAnalyzerEditing=true;
        }
        function eaApplyFilters(){ const ex=examAnalyzerCurrent(); ex.classFilter=document.getElementById('ea-class-filter')?.value||'ALL'; ex.streamFilter=document.getElementById('ea-stream-filter')?.value||'ALL'; examAnalyzerEditing=true; renderGradebook(false); }
        function eaCompleteRow(r, exam){ return r && r.count===exam.subjects.length && exam.subjects.length>0; }
        function eaPerformanceSummary(exam, useUIFilters=true){
            const rows=examAnalyzerRows(exam,useUIFilters);
            const complete=rows.filter(r=>eaCompleteRow(r,exam));
            const entered=rows.filter(r=>r.count>0);
            return {rows,complete,entered};
        }
        function eaTrendData(exam){
            const g=ensureExamAnalyzerData();
            return [...g.exams].filter(e=>e&&Array.isArray(e.subjects)&&e.subjects.length).map(e=>{
                const rows=examAnalyzerRows({...e,classFilter:'ALL',streamFilter:'ALL'},false).filter(r=>eaCompleteRow(r,e));
                const mean=rows.length?rows.reduce((a,r)=>a+r.avg,0)/rows.length:0;
                return {name:e.name,mean,year:e.year,term:e.term,id:e.id};
            }).filter(x=>x.mean>0 || x.id===exam.id);
        }
        function eaClassComparison(exam){
            const rows=examAnalyzerRows({...exam,classFilter:'ALL',streamFilter:'ALL'},false);
            const classes=[...new Set(rows.map(r=>r.student.class).filter(Boolean))].sort();
            return classes.map(cls=>{
                const rr=rows.filter(r=>r.student.class===cls), complete=rr.filter(r=>eaCompleteRow(r,exam));
                const mean=complete.length?complete.reduce((a,r)=>a+r.avg,0)/complete.length:0;
                const pass=complete.filter(r=>r.avg>=41).length;
                return {className:cls,total:rr.length,complete:complete.length,mean,passRate:complete.length?pass/complete.length*100:0};
            });
        }
        function eaTopPerformers(exam, limit=10){
            return examAnalyzerRows({...exam,classFilter:'ALL',streamFilter:'ALL'},false).filter(r=>eaCompleteRow(r,exam)).sort((a,b)=>b.avg-a.avg||b.total-a.total||a.student.name.localeCompare(b.student.name)).slice(0,limit);
        }
        function eaInterventionRows(exam, limit=20){
            return examAnalyzerRows({...exam,classFilter:'ALL',streamFilter:'ALL'},false).filter(r=>r.count>0 && r.avg<41).sort((a,b)=>a.avg-b.avg).slice(0,limit);
        }
        function eaMostImproved(exam){
            const g=ensureExamAnalyzerData(), exams=[...g.exams];
            const idx=exams.findIndex(e=>e.id===exam.id); if(idx<=0)return [];
            const prev=exams[idx-1];
            const current=examAnalyzerRows({...exam,classFilter:'ALL',streamFilter:'ALL'},false), previous=examAnalyzerRows({...prev,classFilter:'ALL',streamFilter:'ALL'},false);
            const pm=new Map(previous.filter(r=>r.count>0).map(r=>[r.student.id,r.avg]));
            return current.filter(r=>r.count>0&&pm.has(r.student.id)).map(r=>({...r,improvement:r.avg-pm.get(r.student.id)})).filter(r=>r.improvement>0).sort((a,b)=>b.improvement-a.improvement).slice(0,10);
        }
        function eaTeacherAnalysis(exam){
            const {g}=eaEnsureTeacherData(), rows=examAnalyzerRows({...exam,classFilter:'ALL',streamFilter:'ALL'},false);
            return exam.subjects.map(sub=>{
                const teacher=eaTeacherForSubject(sub.id), vals=rows.map(r=>Number(r.scores[sub.id])).filter(Number.isFinite);
                const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length/Number(sub.max||100)*100:0;
                const below=rows.filter(r=>Number.isFinite(Number(r.scores[sub.id])) && Number(r.scores[sub.id])/Number(sub.max||100)*100<41).length;
                return {subject:sub.name,teacher:teacher?.name||'Not assigned',avg,entered:vals.length,below};
            });
        }
        function eaDownloadFullAnalysisPDF(){
            const ex=examAnalyzerCurrent();
            if(!window.jspdf || !window.jspdf.jsPDF){alert('PDF library is not available. Please check your internet connection and reload the system.');return;}
            const {jsPDF}=window.jspdf, doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'}), W=doc.internal.pageSize.getWidth();
            const summary=eaPerformanceSummary(ex,false), top=eaTopPerformers(ex,10), intervention=eaInterventionRows(ex,20), classes=eaClassComparison(ex), teachers=eaTeacherAnalysis(ex), trend=eaTrendData(ex);
            doc.setFillColor(20,55,110); doc.rect(0,0,W,28,'F'); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.text(SCHOOL_NAME,W/2,11,{align:'center'}); doc.setFontSize(11); doc.text('COMPREHENSIVE EXAMINATION ANALYSIS REPORT',W/2,19,{align:'center'}); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text(`${ex.name} • ${ex.term} ${ex.year}`,W/2,24,{align:'center'});
            const complete=summary.complete, mean=complete.length?complete.reduce((a,r)=>a+r.avg,0)/complete.length:0, pass=complete.length?complete.filter(r=>r.avg>=41).length/complete.length*100:0;
            doc.setTextColor(30); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text('EXECUTIVE SUMMARY',10,38); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text(`Students: ${summary.rows.length}   Complete: ${complete.length}   Incomplete: ${summary.rows.filter(r=>r.count>0&&!eaCompleteRow(r,ex)).length}   Mean: ${mean.toFixed(1)}%   Pass rate: ${pass.toFixed(1)}%`,10,45);
            let y=53;
            doc.setFont('helvetica','bold'); doc.text('SUBJECT PERFORMANCE',10,y); y+=4;
            doc.autoTable({startY:y,head:[['Subject','Teacher','Marks Entered','Average %','Below 41%']],body:teachers.map(x=>[x.subject,x.teacher,x.entered,x.avg.toFixed(1),x.below]),theme:'grid',margin:{left:10,right:10},styles:{fontSize:8},headStyles:{fillColor:[20,55,110],textColor:[255,255,255]}}); y=(doc.lastAutoTable?.finalY||y+10)+8;
            doc.setFont('helvetica','bold'); doc.text('CLASS COMPARISON',10,y); y+=4;
            doc.autoTable({startY:y,head:[['Class','Learners','Complete','Mean %','Pass Rate']],body:classes.map(x=>[x.className,x.total,x.complete,x.mean.toFixed(1),x.passRate.toFixed(1)+'%']),theme:'grid',margin:{left:10,right:10},styles:{fontSize:8},headStyles:{fillColor:[20,55,110],textColor:[255,255,255]}}); y=(doc.lastAutoTable?.finalY||y+10)+8;
            if(y>235){doc.addPage();y=15;}
            doc.setFont('helvetica','bold'); doc.text('TOP PERFORMERS',10,y); y+=4;
            doc.autoTable({startY:y,head:[['Pos.','Admission','Learner','Class','Average','CBC']],body:top.map((r,i)=>[i+1,r.student.id,r.student.name,r.student.class,r.avg.toFixed(1)+'%',r.grade.grade]),theme:'grid',margin:{left:10,right:10},styles:{fontSize:8},headStyles:{fillColor:[20,55,110],textColor:[255,255,255]}}); y=(doc.lastAutoTable?.finalY||y+10)+8;
            if(y>235){doc.addPage();y=15;}
            doc.setFont('helvetica','bold'); doc.text('LEARNERS REQUIRING ATTENTION (<41%)',10,y); y+=4;
            doc.autoTable({startY:y,head:[['Admission','Learner','Class','Subjects Entered','Average']],body:intervention.map(r=>[r.student.id,r.student.name,r.student.class,`${r.count}/${ex.subjects.length}`,r.avg.toFixed(1)+'%']),theme:'grid',margin:{left:10,right:10},styles:{fontSize:8},headStyles:{fillColor:[20,55,110],textColor:[255,255,255]}}); y=(doc.lastAutoTable?.finalY||y+10)+8;
            if(trend.length){ if(y>245){doc.addPage();y=15;} doc.setFont('helvetica','bold');doc.text('EXAM MEAN TREND',10,y);y+=6; doc.setFont('helvetica','normal');doc.setFontSize(8); trend.forEach((t,i)=>doc.text(`${i+1}. ${t.name}: ${t.mean.toFixed(1)}%`,12,y+i*5)); }
            doc.setFontSize(7);doc.setTextColor(100);doc.text('Generated by RonoTech School Management System • Exam Analyzer',10,287);doc.text(new Date().toLocaleString(),W-10,287,{align:'right'});
            doc.save(`${(ex.name||'Exam')}_Full_Analysis_Report.pdf`.replace(/[^a-z0-9_.-]+/gi,'_'));
        }
        function eaCalculateStats(rows,exam){
            const all=rows.length, entered=rows.filter(r=>r.count>0).length, complete=rows.filter(r=>eaCompleteRow(r,exam));
            const avgs=complete.map(r=>r.avg), mean=avgs.length?avgs.reduce((a,b)=>a+b,0)/avgs.length:0;
            const pass=complete.filter(r=>r.avg>=41).length;
            const bySubject=exam.subjects.map(sub=>{const vals=rows.map(r=>Number(r.scores[sub.id])).filter(Number.isFinite);const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length/Number(sub.max||100)*100:0;return {sub,avg,n:vals.length};});
            const dist=ensureExamAnalyzerData().bands.map(b=>({grade:b.grade,n:complete.filter(r=>r.avg>=b.min&&r.avg<=b.max).length}));
            return {all,entered,complete:complete.length,incomplete:entered-complete.length,mean,passRate:complete.length?pass/complete.length*100:0,bySubject,dist};
        }
        function eaExportCSV(){
            const ex=examAnalyzerCurrent(), rows=examAnalyzerRows(ex); let csv=['Rank,Admission,Student,Class,Stream,Total,Max,Average,Grade,'+ex.subjects.map(s=>`"${s.name}"`).join(',')].join('\n')+'\n';
            rows.sort((a,b)=>b.avg-a.avg).forEach((r,i)=>{csv+=`${i+1},${r.student.id},"${r.student.name}","${r.student.class}","${r.student.stream}",${r.total.toFixed(2)},${r.max.toFixed(2)},${r.avg.toFixed(2)},${r.grade.grade},${ex.subjects.map(s=>Number.isFinite(Number(r.scores[s.id]))?r.scores[s.id]:'').join(',')}\n`;});
            const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=(ex.name||'Exam_Analyzer').replace(/[^a-z0-9]+/gi,'_')+'.csv';a.click();
        }

        function eaAdmissionCompare(a,b){
            const aa=String(a?.id??''), bb=String(b?.id??'');
            const c=aa.localeCompare(bb,undefined,{numeric:true,sensitivity:'base'});
            return c || String(a?.name??'').localeCompare(String(b?.name??''),undefined,{sensitivity:'base'});
        }
        function eaAdmissionSorted(rows){
            return [...rows].sort((a,b)=>eaAdmissionCompare(a.student,b.student));
        }
        function eaPreviousExam(currentExam){
            const g=ensureExamAnalyzerData();
            const idx=g.exams.findIndex(e=>e&&e.id===currentExam?.id);
            return idx>0 ? g.exams[idx-1] : null;
        }
        function eaPreviousSubject(previousExam, subject){
            if(!previousExam||!Array.isArray(previousExam.subjects)) return null;
            return previousExam.subjects.find(s=>s.id===subject.id) ||
                   previousExam.subjects.find(s=>String(s.name).trim().toLowerCase()===String(subject.name).trim().toLowerCase()) || null;
        }
        function eaSubjectComparison(studentId,currentExam,subject){
            const prev=eaPreviousExam(currentExam), ps=eaPreviousSubject(prev,subject);
            if(!prev||!ps) return {previous:null,current:null,change:null,direction:'none',exam:null};
            const cv=Number(currentExam.marks?.[studentId]?.[subject.id]);
            const pv=Number(prev.marks?.[studentId]?.[ps.id]);
            const currentPct=Number.isFinite(cv)&&Number(subject.max)>0 ? cv/Number(subject.max)*100 : null;
            const previousPct=Number.isFinite(pv)&&Number(ps.max)>0 ? pv/Number(ps.max)*100 : null;
            const change=Number.isFinite(currentPct)&&Number.isFinite(previousPct) ? currentPct-previousPct : null;
            return {previous:Number.isFinite(pv)?pv:null,current:Number.isFinite(cv)?cv:null,change,
                    direction:change===null?'none':change>0.004?'increase':change<-0.004?'decrease':'same',
                    exam:prev};
        }
        function eaComparisonRows(studentId,currentExam){
            return currentExam.subjects.map(subject=>({subject,comparison:eaSubjectComparison(studentId,currentExam,subject)}));
        }

        function eaBuildRankMaps(exam) {
            const allRows = examAnalyzerRows({...exam,classFilter:'ALL',streamFilter:'ALL'}, false).filter(r=>r.count>0);
            const school = examAnalyzerRankRows(allRows).rankMap;
            const classes = {};
            const streams = {};
            const classNames = [...new Set(allRows.map(r=>r.student.class).filter(Boolean))];
            classNames.forEach(cls => {
                const rows = allRows.filter(r => r.student.class === cls);
                classes[cls] = examAnalyzerRankRows(rows).rankMap;
                const streamNames = [...new Set(rows.map(r => r.student.stream).filter(Boolean))];
                streamNames.forEach(st => {
                    streams[`${cls}||${st}`] = examAnalyzerRankRows(rows.filter(r=>r.student.stream===st)).rankMap;
                });
            });
            return {school,classes,streams};
        }

        function eaLearnerExamHistory(studentId, currentExam){
            const g=ensureExamAnalyzerData();
            return [...g.exams].filter(e=>e&&Array.isArray(e.subjects)&&e.subjects.length).map(e=>{
                const row=examAnalyzerRows({...e,classFilter:'ALL',streamFilter:'ALL'},false).find(r=>r.student.id===studentId);
                return row&&row.count>0?{id:e.id,name:e.name,term:e.term,year:e.year,avg:row.avg,complete:eaCompleteRow(row,e)}:null;
            }).filter(Boolean);
        }
        function eaDrawLineChart(doc, cfg){
            const {x,y,w,h,title,labels,values,subtitle=''}=cfg;
            doc.setDrawColor(220,226,234); doc.setFillColor(250,252,255); doc.roundedRect(x,y,w,h,3,3,'FD');
            doc.setTextColor(20,55,110); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.text(title,x+4,y+7);
            if(subtitle){doc.setTextColor(100);doc.setFont('helvetica','normal');doc.setFontSize(5.5);doc.text(subtitle,x+4,y+12);}
            const px=x+10, py=y+16, pw=w-17, ph=h-25;
            const max=100,min=0;
            doc.setDrawColor(225); doc.setLineWidth(0.2);
            [0,25,50,75,100].forEach(t=>{const yy=py+ph-(t-min)/(max-min)*ph;doc.line(px,yy,px+pw,yy);doc.setTextColor(115);doc.setFontSize(5);doc.text(String(t),px-2,yy+1.5,{align:'right'});});
            if(!values.length)return;
            const n=values.length, step=n===1?0:pw/(n-1);
            const pts=values.map((v,i)=>{const val=Math.max(0,Math.min(100,Number(v)||0));return [px+i*step,py+ph-(val/100)*ph,val];});
            doc.setDrawColor(37,99,235);doc.setLineWidth(0.8);
            for(let i=1;i<pts.length;i++)doc.line(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]);
            pts.forEach((p,i)=>{doc.setFillColor(37,99,235);doc.circle(p[0],p[1],1.25,'F');doc.setTextColor(35);doc.setFont('helvetica','bold');doc.setFontSize(5.2);doc.text(`${p[2].toFixed(0)}%`,p[0],p[1]-3,{align:'center'});doc.setFont('helvetica','normal');doc.setTextColor(100);const label=String(labels[i]||'').slice(0,15);doc.text(label,p[0],py+ph+7,{align:'center'});});
        }
        function eaDownloadClassReportsPDF() {
            const ex=examAnalyzerCurrent();
            if(!window.jspdf || !window.jspdf.jsPDF){ alert('PDF library is not available. Please check your internet connection and reload the system.'); return; }
            const {jsPDF}=window.jspdf;
            const classFilter=document.getElementById('ea-class-filter')?.value || ex.classFilter || 'ALL';
            const streamFilter=document.getElementById('ea-stream-filter')?.value || ex.streamFilter || 'ALL';
            const selectedStudents=examAnalyzerStudents({...ex,classFilter,streamFilter},false);
            if(!selectedStudents.length){ alert('No students found for the selected class/stream.'); return; }
            const ranks=eaBuildRankMaps(ex), previousExam=eaPreviousExam(ex);
            const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
            const pageW=doc.internal.pageSize.getWidth(), pageH=doc.internal.pageSize.getHeight(); let first=true;
            eaAdmissionSorted(selectedStudents.map(st=>examAnalyzerRows({...ex,classFilter:st.class,streamFilter:st.stream},false).find(r=>r.student.id===st.id)).filter(Boolean)).forEach(r=>{
                if(!first) doc.addPage(); first=false; const s=r.student;
                const schoolRank=ranks.school.get(s.id)||'—', classRank=ranks.classes[s.class]?.get(s.id)||'—', streamRank=s.stream?(ranks.streams[`${s.class}||${s.stream}`]?.get(s.id)||'—'):'—';
                const previousRow=previousExam ? examAnalyzerRows({...previousExam,classFilter:s.class,streamFilter:s.stream},false).find(x=>x.student.id===s.id) : null;
                const previousAvg=previousRow&&previousRow.count>0?previousRow.avg:null;
                const overallChange=previousAvg!==null ? r.avg-previousAvg : null;
                const prevLabel=previousExam ? `${previousExam.name} (${previousExam.term||''} ${previousExam.year||''})`.replace(/\s+/g,' ').trim() : 'No previous exam';
                doc.setFillColor(20,55,110); doc.rect(0,0,pageW,27,'F');
                doc.setFillColor(245,193,66); doc.rect(0,25,pageW,2,'F');
                doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text(SCHOOL_NAME,pageW/2,10,{align:'center'});
                doc.setFontSize(9); doc.text('CBC LEARNER PERFORMANCE REPORT CARD',pageW/2,16,{align:'center'}); doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.text(`${ex.name}  •  ${ex.term} ${ex.year}`,pageW/2,22,{align:'center'});
                doc.setTextColor(30); doc.setFillColor(248,250,252); doc.roundedRect(10,33,pageW-20,28,3,3,'F');
                doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(20,55,110); doc.text('LEARNER DETAILS',14,39); doc.text('PERFORMANCE',110,39);
                doc.setFont('helvetica','normal'); doc.setTextColor(30); doc.setFontSize(7.5);
                doc.text(`Name: ${s.name}`,14,46); doc.text(`Admission No.: ${s.id}`,14,52); doc.text(`Class: ${s.class||'—'}`,14,58); doc.text(`Stream: ${s.stream||'—'}`,14,64);
                doc.text(`School Position: ${schoolRank}`,110,46); doc.text(`Class Position: ${classRank}`,110,52); doc.text(`Stream Position: ${streamRank}`,110,58);
                doc.text(`Current Average: ${r.avg.toFixed(1)}%  |  ${r.grade.grade}`,110,64);
                const body=ex.subjects.map(sub=>{
                    const cmp=eaSubjectComparison(s.id,ex,sub);
                    const current=Number.isFinite(cmp.current)?`${cmp.current}/${sub.max}`:'—';
                    const previous=Number.isFinite(cmp.previous)?`${cmp.previous}/${eaPreviousSubject(previousExam,sub)?.max||100}`:'—';
                    const change=cmp.change===null?'—':`${cmp.change>0?'↑ ':cmp.change<0?'↓ ':'→ '}${Math.abs(cmp.change).toFixed(1)} pp`;
                    const pct=Number.isFinite(cmp.current)&&Number(sub.max)>0?cmp.current/Number(sub.max)*100:null;
                    const band=pct===null?{grade:'—',label:'No mark'}:examAnalyzerGrade(pct);
                    return [sub.name,previous,current,change,pct===null?'—':pct.toFixed(1)+'%',band.grade,eaTeacherName(sub.id)];
                });
                doc.autoTable({
                    startY:70,
                    head:[[
                        'Subject',
                        previousExam ? `Last Exam\n${prevLabel}` : 'Last Exam',
                        `Current Exam\n${ex.name}`,
                        'Change',
                        'Current %',
                        'CBC',
                        'Teacher'
                    ]],
                    body,
                    theme:'grid',
                    margin:{left:10,right:10},
                    styles:{font:'helvetica',fontSize:6.1,cellPadding:1.15,overflow:'linebreak',minCellHeight:5},
                    headStyles:{fillColor:[20,55,110],textColor:[255,255,255],fontStyle:'bold',halign:'center'},
                    columnStyles:{0:{cellWidth:31},1:{cellWidth:31,halign:'center'},2:{cellWidth:31,halign:'center'},3:{cellWidth:20,halign:'center'},4:{cellWidth:17,halign:'center'},5:{cellWidth:12,halign:'center'},6:{cellWidth:38}}
                });
                let y=(doc.lastAutoTable?.finalY||125)+5;
                doc.setFillColor(239,246,255); doc.roundedRect(10,y,pageW-20,24,3,3,'F');
                doc.setTextColor(20,55,110); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.text('EXAM COMPARISON',14,y+6);
                doc.setTextColor(30); doc.setFont('helvetica','normal'); doc.setFontSize(7.2);
                doc.text(`Current: ${r.avg.toFixed(1)}%`,14,y+13);
                doc.text(`Last: ${previousAvg===null?'—':previousAvg.toFixed(1)+'%'}`,72,y+13);
                doc.text(`Overall change: ${overallChange===null?'—':(overallChange>0?'↑ Increase ':overallChange<0?'↓ Decrease ':'→ No change ')+Math.abs(overallChange).toFixed(1)+' pp'}`,135,y+13);
                y+=29;
                const subjectLabels=ex.subjects.map(sub=>String(sub.name).length>12?String(sub.name).slice(0,12)+'…':String(sub.name));
                const subjectValues=ex.subjects.map(sub=>{const v=Number(r.scores[sub.id]);return Number.isFinite(v)&&Number(sub.max)>0?v/Number(sub.max)*100:0;});
                eaDrawLineChart(doc,{x:10,y,w:92,h:47,title:'CURRENT SUBJECT PERFORMANCE',subtitle:'Current exam percentage by subject',labels:subjectLabels,values:subjectValues});
                const previousValues=ex.subjects.map(sub=>{const c=eaSubjectComparison(s.id,ex,sub);return Number.isFinite(c.previous)&&Number((eaPreviousSubject(previousExam,sub)||{}).max)>0?c.previous/Number(eaPreviousSubject(previousExam,sub).max)*100:0;});
                eaDrawLineChart(doc,{x:108,y,w:92,h:47,title:'LAST EXAM SUBJECT PERFORMANCE',subtitle:previousExam?'Previous exam percentage by subject':'No previous exam recorded',labels:subjectLabels,values:previousValues});
                y+=52;
                const classTeacherComment=eaClassTeacherComment(r);
                doc.setFillColor(248,250,252); doc.roundedRect(10,y,pageW-20,24,3,3,'F'); doc.setTextColor(20,55,110); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.text('CLASS TEACHER COMMENT',14,y+6);
                doc.setFont('helvetica','normal'); doc.setTextColor(30); doc.setFontSize(7); const commentLines=doc.splitTextToSize(classTeacherComment,pageW-28); doc.text(commentLines.slice(0,2),14,y+13);
                doc.setFontSize(6); doc.setTextColor(90); doc.text('Comparison uses only the current exam and the immediately previous recorded exam.',10,pageH-8); doc.text(`${s.name} • ${ex.name}`,pageW-10,pageH-8,{align:'right'});
            });
            const safeClass=(classFilter==='ALL'?'All_Classes':classFilter).replace(/[^a-z0-9]+/gi,'_'), safeStream=(streamFilter==='ALL'?'All_Streams':streamFilter).replace(/[^a-z0-9]+/gi,'_');
            doc.save(`${(ex.name||'Exam').replace(/[^a-z0-9]+/gi,'_')}_${safeClass}_${safeStream}_Professional_A4_Report_Cards.pdf`);
        }

        function csvQuote(v){ return `"${String(v??'').replace(/"/g,'""')}"`; }

        function eaPrint(){
            const ex=examAnalyzerCurrent(), rows=examAnalyzerRows(ex).sort((a,b)=>b.avg-a.avg); const html=`<div class="print-sheet"><h1 style="font-size:24px;font-weight:bold">${eaEsc(SCHOOL_NAME)}</h1><h2 style="font-size:20px">${eaEsc(ex.name)} — Exam Analysis</h2><p>${eaEsc(ex.term)} | ${ex.year}</p><table style="width:100%;margin-top:15px;border-collapse:collapse"><thead><tr><th>Rank</th><th>Admission</th><th>Student</th>${ex.subjects.map(s=>`<th>${eaEsc(s.name)}</th>`).join('')}<th>Average</th><th>Grade</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${eaEsc(r.student.id)}</td><td>${eaEsc(r.student.name)}</td>${ex.subjects.map(s=>`<td>${Number.isFinite(Number(r.scores[s.id]))?r.scores[s.id]:'—'}</td>`).join('')}<td>${r.avg.toFixed(2)}%</td><td>${r.grade.grade}</td></tr>`).join('')}</tbody></table></div>`; preparePrintLayout(ex.name+' - Exam Analysis',html); }
        function eaStudentReport(id){
            const ex=examAnalyzerCurrent(), student=(SMS_DB.students||[]).find(x=>x.id===id);
            if(!student) return;
            const oldClass=document.getElementById('ea-class-filter')?.value||'ALL';
            const oldStream=document.getElementById('ea-stream-filter')?.value||'ALL';
            const cf=document.getElementById('ea-class-filter'), sf=document.getElementById('ea-stream-filter');
            if(cf) cf.value=student.class||'ALL'; if(sf) sf.value=student.stream||'ALL';
            eaDownloadClassReportsPDF();
            if(cf) cf.value=oldClass; if(sf) sf.value=oldStream;
        }
        function eaRenderCharts(stats){
            const c=document.getElementById('ea-chart'); if(!c)return; const labels=stats.bySubject.map(x=>x.sub.name), vals=stats.bySubject.map(x=>Number(x.avg.toFixed(1)));
            if(window._eaChart) window._eaChart.destroy();
            if(window.Chart) window._eaChart=new Chart(c,{
                type:'line',
                data:{labels,datasets:[{label:'Subject Average %',data:vals,tension:0.25,fill:false,pointRadius:4,pointHoverRadius:6}]},
                options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true}},scales:{y:{beginAtZero:true,max:100,title:{display:true,text:'Average %'}},x:{title:{display:true,text:'Subject'}}}}
            });
            const tc=document.getElementById('ea-trend-chart'), trend=eaTrendData(examAnalyzerCurrent());
            if(tc){ if(window._eaTrendChart) window._eaTrendChart.destroy(); if(window.Chart) window._eaTrendChart=new Chart(tc,{type:'line',data:{labels:trend.map(x=>x.name),datasets:[{label:'Complete-result Mean %',data:trend.map(x=>Number(x.mean.toFixed(1))),tension:0.25,fill:false,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,max:100},x:{ticks:{autoSkip:false}}}}}); }
        }
        function renderGradebook(allowSync=true) {
            pageTitle.textContent='Academic Management - Exam Analyzer';
            const g=ensureExamAnalyzerData(), ex=examAnalyzerCurrent();
            const classes=[...new Set((SMS_DB.students||[]).map(s=>s.class).filter(Boolean))].sort(), streams=[...new Set((SMS_DB.students||[]).map(s=>s.stream).filter(Boolean))].sort();
            const rows=examAnalyzerRows(ex), stats=eaCalculateStats(rows,ex), rankData=examAnalyzerRankRows(rows), rankMap=rankData.rankMap, displayRows=[...rows].sort((a,b)=>(rankMap.get(a.student.id)||99999)-(rankMap.get(b.student.id)||99999)||a.student.name.localeCompare(b.student.name));
            const subjectStats=stats.bySubject.map(x=>`<div class="bg-white rounded-xl border p-4"><div class="font-semibold">${eaEsc(x.sub.name)}</div><div class="text-2xl font-bold text-blue-700">${x.avg.toFixed(1)}%</div><div class="text-xs text-gray-500">${x.n} marks entered</div></div>`).join('');
            const topRows=eaTopPerformers(ex,5), interventionRows=eaInterventionRows(ex,8), improvedRows=eaMostImproved(ex), classRows=eaClassComparison(ex), teacherRows=eaTeacherAnalysis(ex);
            const incompleteRows=rows.filter(r=>r.count>0&&r.count<ex.subjects.length);
            const trendData=eaTrendData(ex);
            const topHtml=topRows.length?topRows.map((r,i)=>`<div class="flex items-center justify-between border-b py-2"><span><b>${i+1}.</b> ${eaEsc(r.student.name)} <span class="text-xs text-gray-500">${eaEsc(r.student.class||'')}</span></span><span class="font-bold text-blue-700">${r.avg.toFixed(1)}%</span></div>`).join(''):'<p class="text-gray-500">No complete results yet.</p>';
            const interventionHtml=interventionRows.length?interventionRows.map(r=>`<div class="flex justify-between border-b py-2"><span>${eaEsc(r.student.name)} <span class="text-xs text-gray-500">${r.count}/${ex.subjects.length} marks</span></span><span class="font-bold text-red-600">${r.avg.toFixed(1)}%</span></div>`).join(''):'<p class="text-gray-500">No learners below 41%.</p>';
            const classHtml=classRows.length?classRows.map(x=>`<tr class="border-b"><td class="p-2 font-semibold">${eaEsc(x.className)}</td><td class="p-2">${x.total}</td><td class="p-2">${x.complete}</td><td class="p-2 font-bold">${x.mean.toFixed(1)}%</td><td class="p-2">${x.passRate.toFixed(1)}%</td></tr>`).join(''):'<tr><td colspan="5" class="p-3 text-center">No class data.</td></tr>';
            const teacherHtml=teacherRows.map(x=>`<tr class="border-b"><td class="p-2">${eaEsc(x.subject)}</td><td class="p-2">${eaEsc(x.teacher)}</td><td class="p-2">${x.entered}</td><td class="p-2 font-bold">${x.avg.toFixed(1)}%</td><td class="p-2">${x.below}</td></tr>`).join('');
            contentContainer.innerHTML=`
            <div class="space-y-6">
              <div class="bg-gradient-to-r from-blue-800 to-indigo-700 text-white rounded-2xl p-6 shadow-lg"><div class="flex flex-col md:flex-row md:justify-between md:items-center gap-4"><div><h2 class="text-3xl font-bold">📊 Exam Analyzer</h2><p class="opacity-90">Integrated with Mabasi School Management System • shared live LAN data</p></div><div class="flex gap-2"><button onclick="eaCreateExam()" class="bg-white text-blue-800 px-4 py-2 rounded-lg font-semibold">+ New Exam</button><button onclick="eaExportCSV()" class="bg-emerald-500 text-white px-4 py-2 rounded-lg">Export CSV</button><button onclick="eaDownloadFullAnalysisPDF()" class="bg-amber-600 text-white px-4 py-2 rounded-lg">Full Analysis PDF</button><button onclick="eaDownloadClassScoreSheet()" class="bg-teal-700 text-white px-4 py-2 rounded-lg">Download PDF Class Score Sheet</button><button onclick="eaDownloadClassReportsPDF()" class="bg-purple-700 text-white px-4 py-2 rounded-lg">Professional A4 Report Cards</button><button onclick="eaPrint()" class="bg-gray-900 text-white px-4 py-2 rounded-lg">Print</button></div></div></div>
              <div class="bg-white rounded-xl shadow p-5 border"><div class="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"><label class="text-sm font-semibold">Exam<select id="ea-exam" onchange="eaSelectExam(this.value)" class="mt-1 w-full border rounded-lg p-2">${g.exams.map(e=>`<option value="${e.id}" ${e.id===ex.id?'selected':''}>${eaEsc(e.name)} — ${eaEsc(e.term)}</option>`).join('')}</select></label><label class="text-sm font-semibold">Class<select id="ea-class-filter" onchange="eaApplyFilters()" class="mt-1 w-full border rounded-lg p-2"><option value="ALL">All Classes</option>${classes.map(c=>`<option ${c===(ex.classFilter||'ALL')?'selected':''}>${eaEsc(c)}</option>`).join('')}</select></label><label class="text-sm font-semibold">Stream<select id="ea-stream-filter" onchange="eaApplyFilters()" class="mt-1 w-full border rounded-lg p-2"><option value="ALL">All Streams</option>${streams.map(c=>`<option ${c===(ex.streamFilter||'ALL')?'selected':''}>${eaEsc(c)}</option>`).join('')}</select></label><label class="text-sm font-semibold">Search<input id="ea-search" oninput="document.querySelectorAll('#ea-table tbody tr').forEach(r=>r.style.display=r.innerText.toLowerCase().includes(this.value.toLowerCase())?'':'none')" placeholder="Admission or student name" class="mt-1 w-full border rounded-lg p-2"></label><div class="flex gap-2"><button onclick="examAnalyzerSave()" class="bg-blue-700 text-white px-4 py-2 rounded-lg">Save</button><button onclick="eaDeleteExam()" class="bg-red-600 text-white px-4 py-2 rounded-lg">Delete</button></div></div></div>
              ${eaTeacherPanel()}
              <div class="grid grid-cols-2 md:grid-cols-7 gap-3"><div class="bg-white rounded-xl shadow p-4"><div class="text-xs text-gray-500">Students</div><div class="text-2xl font-bold">${stats.all}</div></div><div class="bg-white rounded-xl shadow p-4"><div class="text-xs text-gray-500">Complete</div><div class="text-2xl font-bold text-emerald-700">${stats.complete}</div></div><div class="bg-white rounded-xl shadow p-4"><div class="text-xs text-gray-500">Incomplete</div><div class="text-2xl font-bold text-amber-600">${stats.incomplete}</div></div><div class="bg-white rounded-xl shadow p-4"><div class="text-xs text-gray-500">Mean</div><div class="text-2xl font-bold">${stats.mean.toFixed(2)}%</div></div><div class="bg-white rounded-xl shadow p-4"><div class="text-xs text-gray-500">Pass Rate</div><div class="text-2xl font-bold">${stats.passRate.toFixed(1)}%</div></div><div class="bg-white rounded-xl shadow p-4"><div class="text-xs text-gray-500">Attention</div><div class="text-2xl font-bold text-red-600">${interventionRows.length}</div></div><div class="bg-white rounded-xl shadow p-4"><div class="text-xs text-gray-500">Subjects</div><div class="text-2xl font-bold">${ex.subjects.length}</div></div></div>
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6"><div class="lg:col-span-2 bg-white rounded-xl shadow p-5"><div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Subject Analysis</h3><button onclick="eaNewSubject()" class="text-blue-700 font-semibold">+ Subject</button></div><div class="grid grid-cols-2 md:grid-cols-3 gap-3">${subjectStats||'<p>No subjects configured.</p>'}</div></div><div class="bg-white rounded-xl shadow p-5"><h3 class="text-xl font-bold mb-3">Grade Distribution</h3>${stats.dist.map(d=>`<div class="flex justify-between border-b py-2"><span class="font-semibold">${d.grade}</span><span>${d.n}</span></div>`).join('')}</div></div>
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6"><div class="bg-white rounded-xl shadow p-5"><h3 class="text-xl font-bold mb-3">🏆 Top Performers</h3>${topHtml}</div><div class="bg-white rounded-xl shadow p-5"><h3 class="text-xl font-bold mb-3">⚠️ Learners Requiring Attention</h3>${interventionHtml}</div><div class="bg-white rounded-xl shadow p-5"><h3 class="text-xl font-bold mb-3">📈 Most Improved</h3>${improvedRows.length?improvedRows.map(r=>`<div class="flex justify-between border-b py-2"><span>${eaEsc(r.student.name)}</span><span class="font-bold text-emerald-700">+${r.improvement.toFixed(1)}%</span></div>`).join(''):'<p class="text-gray-500">Available after at least two exams.</p>'}</div></div>
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="bg-white rounded-xl shadow p-5"><h3 class="text-xl font-bold mb-3">📊 Class Comparison</h3><div class="overflow-x-auto"><table class="min-w-full text-sm"><thead class="bg-gray-100"><tr><th class="p-2 text-left">Class</th><th class="p-2">Learners</th><th class="p-2">Complete</th><th class="p-2">Mean</th><th class="p-2">Pass Rate</th></tr></thead><tbody>${classHtml}</tbody></table></div></div><div class="bg-white rounded-xl shadow p-5"><h3 class="text-xl font-bold mb-3">👨‍🏫 Teacher / Subject Analysis</h3><div class="overflow-x-auto"><table class="min-w-full text-sm"><thead class="bg-gray-100"><tr><th class="p-2 text-left">Subject</th><th class="p-2 text-left">Teacher</th><th class="p-2">Entered</th><th class="p-2">Average</th><th class="p-2">Below 41%</th></tr></thead><tbody>${teacherHtml}</tbody></table></div></div></div>
              <div class="bg-white rounded-xl shadow p-5"><div class="flex justify-between items-center mb-3"><h3 class="text-xl font-bold">⚠️ Incomplete Marks</h3><span class="text-sm text-gray-500">${incompleteRows.length} learner(s)</span></div>${incompleteRows.length?`<div class="overflow-x-auto"><table class="min-w-full text-sm"><thead class="bg-gray-100"><tr><th class="p-2 text-left">Admission</th><th class="p-2 text-left">Learner</th><th class="p-2">Class</th><th class="p-2">Marks Entered</th><th class="p-2">Missing</th></tr></thead><tbody>${incompleteRows.map(r=>`<tr class="border-b"><td class="p-2">${eaEsc(r.student.id)}</td><td class="p-2 font-semibold">${eaEsc(r.student.name)}</td><td class="p-2">${eaEsc(r.student.class||'')}</td><td class="p-2">${r.count}/${ex.subjects.length}</td><td class="p-2 text-red-600">${ex.subjects.filter(sub=>!Number.isFinite(Number(r.scores[sub.id]))).map(sub=>eaEsc(sub.name)).join(', ')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="text-gray-500">No incomplete learner records.</p>'}</div>
              <div class="bg-white rounded-xl shadow p-5"><h3 class="text-xl font-bold mb-4">Performance Trend by Subject</h3><div style="height:300px"><canvas id="ea-chart"></canvas></div><p class="text-xs text-gray-500 mt-2">Subject averages for the selected examination.</p><div style="height:280px" class="mt-6"><canvas id="ea-trend-chart"></canvas></div><p class="text-xs text-gray-500 mt-2">School-wide mean trend across saved examinations; only complete learner results are included.</p></div>
              <div class="bg-white rounded-xl shadow p-5"><div class="flex justify-between items-center mb-4"><div><h3 class="text-xl font-bold">Marks Entry & Ranking</h3><p class="text-sm text-gray-500">All enrolled students are listed. Enter marks directly; changes are shared with other LAN devices after Save.</p></div></div><div class="overflow-x-auto"><table id="ea-table" class="min-w-full text-sm"><thead class="bg-gray-100"><tr><th class="p-2 text-left">Rank</th><th class="p-2 text-left">Admission</th><th class="p-2 text-left">Student</th>${ex.subjects.map(s=>`<th class="p-2 text-center">${eaEsc(s.name)}<br><span class="text-xs font-normal">/${s.max}</span></th>`).join('')}<th class="p-2">Average</th><th class="p-2">Grade</th><th class="p-2">Report</th></tr></thead><tbody>${displayRows.length?displayRows.map((r)=>`<tr class="border-b hover:bg-gray-50"><td class="p-2 font-bold">${rankMap.get(r.student.id)||'—'}</td><td class="p-2">${eaEsc(r.student.id)}</td><td class="p-2 font-semibold">${eaEsc(r.student.name)}<br><span class="text-xs text-gray-500">${eaEsc(r.student.class)} ${eaEsc(r.student.stream||'')}</span></td>${ex.subjects.map(sub=>{const v=r.scores[sub.id];return `<td class="p-1 align-top"><input type="number" min="0" max="${sub.max}" step="0.01" value="${Number.isFinite(Number(v))?v:''}" onchange="eaSetMark('${r.student.id}','${sub.id}',this.value)" class="w-20 border rounded p-2 text-center"><button onclick="eaEditComment('${r.student.id}','${sub.id}')" class="block text-[10px] text-indigo-700 mt-1">${eaSubjectComment(r.student.id,sub.id)?'Edit comment':'Add comment'}</button></td>`}).join('')}<td class="p-2 font-bold">${r.avg.toFixed(2)}%</td><td class="p-2"><span class="px-2 py-1 rounded bg-blue-100 text-blue-800 font-semibold">${r.grade.grade}</span></td><td class="p-2"><button onclick="eaStudentReport('${r.student.id}')" class="text-indigo-700">Print</button></td></tr>`).join(''):`<tr><td colspan="${ex.subjects.length+7}" class="p-8 text-center text-gray-500">No marks entered yet. Enter marks above to generate the analysis.</td></tr>`}</tbody></table></div></div>
              <div class="bg-slate-50 border rounded-xl p-5"><h3 class="font-bold mb-2">CBC Grading System</h3><div class="grid grid-cols-2 md:grid-cols-4 gap-2">${g.bands.map(b=>`<div class="bg-white border rounded-lg px-3 py-2"><div class="font-bold text-blue-800">${b.grade}</div><div class="text-xs">${b.min}-${b.max}%</div><div class="text-xs text-gray-500">${eaEsc(b.label)}</div></div>`).join('')}</div><p class="text-xs text-gray-500 mt-3">CBC achievement levels used by this analyzer: EE1, EE2, ME1, ME2, AE1, AE2, BE1 and BE2. Ranking is based on overall percentage; students without entered marks remain unranked.</p></div>
            </div>`;
            setTimeout(()=>eaRenderCharts(stats),50);
            if(allowSync) { examAnalyzerLoadServer(); examAnalyzerStartSync(); }
        }
        function calculateFine(issue, forReport = false) {
            if (issue.returnDate && !forReport) return 0; 
            
            let dateToCheck;
            if (issue.returnDate && forReport) {
                dateToCheck = new Date(issue.returnDate + 'T00:00:00');
            } else if (!issue.returnDate && !forReport) {
                dateToCheck = new Date(); 
                dateToCheck.setHours(0, 0, 0, 0); 
            } else {
                return 0; 
            }
            
            const dueDate = new Date(issue.dueDate + 'T00:00:00');
            
            if (dateToCheck <= dueDate) return 0;
            
            const timeDiff = dateToCheck.getTime() - dueDate.getTime();
            const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
            
            return parseFloat((dayDiff * FINE_RATE_PER_DAY).toFixed(2));
        }

        function renderLibrary() {
            pageTitle.textContent = "Library Management System";
            const totalBooks = SMS_DB.books?.reduce((sum, book) => sum + book.copies, 0) || 0;
            const issuedBooks = SMS_DB.issues?.filter(i => !i.returnDate).length || 0;
            const overdueBooks = SMS_DB.issues?.filter(i => !i.returnDate && new Date(i.dueDate + 'T00:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T00:00:00')).length || 0;
            
            const tabClass = (tab) => currentSubView === tab ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300';
            
            const libraryHTML = `
                <div class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        ${createCard('Total Stock', totalBooks, 'book-open', 'bg-purple-600', 'navigate("library", { subView: "catalog" })')}
                        ${createCard('Currently Issued', issuedBooks, 'archive', 'bg-orange-600', 'navigate("library", { subView: "issue" })')}
                        ${createCard('Available Copies', SMS_DB.books?.reduce((sum, b) => sum + b.available, 0) || 0, 'book-open', 'bg-green-600', 'navigate("library", { subView: "catalog" })')}
                        ${createCard('Overdue Books', overdueBooks, 'alert', 'bg-red-600', 'navigate("library", { subView: "fines" })')}
                    </div>
                    <div class="flex border-b border-gray-300">
                        <button onclick="navigate('library', { subView: 'catalog' })" class="px-6 py-3 font-semibold rounded-t-lg ${tabClass('catalog')}">Book Catalog</button>
                        <button onclick="navigate('library', { subView: 'issue' })" class="px-6 py-3 font-semibold rounded-t-lg ${tabClass('issue')}">Issue & Return</button>
                        <button onclick="navigate('library', { subView: 'fines' })" class="px-6 py-3 font-semibold rounded-t-lg ${tabClass('fines')}">Fines & Reports</button>
                    </div>
                    <div id="library-subcontent" class="bg-white p-6 rounded-b-xl shadow-lg">
                        ${currentSubView === 'catalog' ? renderBookCatalog() : currentSubView === 'issue' ? renderIssueReturn() : renderLibraryReports()}
                    </div>
                </div>
            `;
            contentContainer.innerHTML = libraryHTML;
        }

        function renderBookCatalog() { 
            const books = SMS_DB.books || [];
            const tableRows = books.map(book => `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="px-6 py-3">${book.id}</td>
                    <td class="px-6 py-3 font-medium">${book.title}</td>
                    <td class="px-6 py-3">${book.author}</td>
                    <td class="px-6 py-3">${book.copies}</td>
                    <td class="px-6 py-3 text-green-700">${book.available}</td>
                    <td class="px-6 py-3"> <button onclick="navigate('library-book-edit', { bookId: '${book.id}' })" class="text-blue-600 hover:text-blue-900 mr-2">Edit</button></td>
                </tr>
            `).join('');
            return `<div class="flex justify-between items-center mb-6 border-b pb-4"><h3 class="text-xl font-semibold">Book Inventory (${books.length} Titles)</h3><button onclick="navigate('library-book-add')" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"> + Add New Book</button></div><div class="overflow-x-auto"><table class="min-w-full"><thead><tr><th class="px-6 py-3 text-left text-xs">ID</th><th class="px-6 py-3 text-left text-xs">Title</th><th class="px-6 py-3 text-left text-xs">Author</th><th class="px-6 py-3 text-left text-xs">Total Copies</th><th class="px-6 py-3 text-left text-xs">Available</th><th class="px-6 py-3 text-left text-xs">Actions</th></tr></thead><tbody class="bg-white">${tableRows}</tbody></table></div>`;
        }

        function renderIssueReturn() {
            const activeIssues = SMS_DB.issues?.filter(i => !i.returnDate).map(i => {
                const book = SMS_DB.books.find(b => b.id === i.bookId);
                const student = SMS_DB.students.find(s => s.id === i.studentId);
                const fine = calculateFine(i);
                return { ...i, bookTitle: book?.title || 'Unknown Book', studentName: student?.name || 'Unknown Student', fine };
            }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)) || [];

            const issuesRows = activeIssues.map(i => {
                const isOverdue = i.fine > 0;
                return `
                    <tr class="hover:bg-gray-50 border-b ${isOverdue ? 'bg-red-50' : ''}">
                        <td class="px-3 py-3">${i.studentName} (${i.studentId})</td>
                        <td class="px-3 py-3">${i.bookTitle}</td>
                        <td class="px-3 py-3 font-medium text-purple-700">${i.bookNumber || '—'}</td>
                        <td class="px-3 py-3">${formatDate(i.issueDate)}</td>
                        <td class="px-3 py-3">${formatDate(i.dueDate)}</td>
                        <td class="px-3 py-3 ${isOverdue ? 'text-red-700 font-bold' : 'text-green-700'}">${formatCurrency(i.fine)}</td>
                        <td class="px-3 py-3">
                            <button onclick="promptReturn('${i.id}')" class="text-indigo-600 hover:text-indigo-800 text-sm">Return</button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            const searchableStudentSelect = createSearchableStudentSelect('issue-student-id');
            const bookOptions = (SMS_DB.books || []).filter(b => b.available > 0).map(b => `<option value="${b.id}">${b.title} (${b.available} available)</option>`).join('');

            return `
                <div class="grid grid-cols-1 lg:col-span-4 gap-6">
                    <div class="lg:col-span-1 bg-gray-50 p-6 rounded-lg border shadow-inner h-fit">
                        <h3 class="text-xl font-semibold mb-4 text-blue-800">Issue Book</h3>
                        <form id="issue-form" onsubmit="handleBookIssue(event)">
                            <div class="space-y-3">
                                ${searchableStudentSelect}
                                <select id="issue-book-id" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"><option value="">Select Book</option>${bookOptions}</select>
                                <div>
                                    <label for="issue-book-number" class="block text-sm font-medium text-gray-700">Book Number / Accession No. <span class="text-gray-400 font-normal">(optional)</span></label>
                                    <input id="issue-book-number" type="text" maxlength="50" placeholder="e.g. BK-001-01" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                    <p class="text-xs text-gray-500 mt-1">Enter the physical copy number if your library labels individual books.</p>
                                </div>
                            </div>
                            <button type="submit" class="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-md" ${bookOptions.length === 0 ? 'disabled' : ''}>
                                Issue Book
                            </button>
                            ${bookOptions.length === 0 ? '<p class="text-red-500 text-xs mt-1">No books currently available.</p>' : ''}
                        </form>
                    </div>

                    <div class="lg:col-span-4">
                        <h3 class="text-xl font-semibold mb-4 text-gray-800">Active Issues (${activeIssues.length})</h3>
                        <div class="overflow-x-auto max-h-[500px] custom-scroll">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Book Title</th>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Book No.</th>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issued</th>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fine Due</th>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    ${issuesRows || `<tr><td colspan="7" class="text-center py-4 text-gray-500">No books currently issued.</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }

        function handleBookIssue(event) {
            event.preventDefault();
            const studentId = document.getElementById('issue-student-id').value;
            const bookId = document.getElementById('issue-book-id').value;
            const bookNumber = (document.getElementById('issue-book-number')?.value || '').trim();

            if (!studentId) {
                alert("Please select a valid student.");
                return;
            }
            
            const book = SMS_DB.books.find(b => b.id === bookId);
            if (!book || book.available <= 0) {
                alert("Book is out of stock or invalid.");
                return;
            }

            if (bookNumber) {
                const duplicate = (SMS_DB.issues || []).some(i => !i.returnDate && String(i.bookNumber || '').trim().toLowerCase() === bookNumber.toLowerCase());
                if (duplicate) {
                    alert("That book number is already issued. Please check the physical book number or return the existing issue first.");
                    return;
                }
            }

            const issueDate = new Date();
            const dueDate = new Date();
            dueDate.setDate(issueDate.getDate() + MAX_LOAN_DAYS);

            const newIssue = {
                id: generateUniqueId('ISS'),
                bookId: bookId,
                bookNumber: bookNumber || null,
                studentId: studentId,
                issueDate: issueDate.toISOString().split('T')[0],
                dueDate: dueDate.toISOString().split('T')[0],
                returnDate: null
            };

            SMS_DB.issues.push(newIssue);
            book.available -= 1;
            saveData();
            navigate('library', { subView: 'issue' });
        }

        function promptReturn(issueId) {
            const issueIndex = SMS_DB.issues.findIndex(i => i.id === issueId);
            if (issueIndex === -1) return;

            const issue = SMS_DB.issues[issueIndex];
            const fine = calculateFine(issue);

            if (fine > 0) {
                if (!confirm(`Book is overdue! Fine due: ${formatCurrency(fine)}. Process return and mark fine as paid? (Assuming fine payment is handled during return for simplicity)`)) {
                    return;
                }
            } else {
                 if (!confirm("Confirm return of book?")) {
                    return;
                }
            }

            SMS_DB.issues[issueIndex].returnDate = new Date().toISOString().split('T')[0];
            const book = SMS_DB.books.find(b => b.id === issue.bookId);
            if (book) {
                book.available += 1;
            }

            saveData();
            navigate('library', { subView: 'issue' });
        }
        
        function renderLibraryReports() { 
             const historicalFines = (SMS_DB.issues || [])
                .filter(i => i.returnDate)
                .reduce((sum, i) => sum + calculateFine(i, true), 0); 

             const currentOverdueFines = (SMS_DB.issues || [])
                .filter(i => !i.returnDate && new Date(i.dueDate + 'T00:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T00:00:00'))
                .reduce((sum, i) => sum + calculateFine(i), 0); 
                
             const totalFinesAccrued = historicalFines + currentOverdueFines;

            const overdueIssues = (SMS_DB.issues || [])
                .filter(i => !i.returnDate && new Date(i.dueDate + 'T00:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T00:00:00'))
                .map(i => {
                    const student = SMS_DB.students.find(s => s.id === i.studentId);
                    const book = SMS_DB.books.find(b => b.id === i.bookId);
                    return { ...i, studentName: student?.name || 'Unknown Student', bookTitle: book?.title || 'Unknown Book', fine: calculateFine(i) };
                })
                .sort((a, b) => b.fine - a.fine);

            const overdueRows = overdueIssues.map(i => `
                <tr class="hover:bg-red-50 border-b">
                    <td class="px-4 py-3">${i.studentName}</td>
                    <td class="px-4 py-3">${i.bookTitle}</td>
                    <td class="px-4 py-3">${formatDate(i.dueDate)}</td>
                    <td class="px-4 py-3 text-red-700 font-bold">${formatCurrency(i.fine)}</td>
                </tr>
            `).join('');


            return `
                <h3 class="text-xl font-semibold mb-4 text-red-800">Library Fines and Overdue Items</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    ${createCard('Total Historical Fines Paid (Stub)', formatCurrency(historicalFines), 'currency', 'bg-indigo-700', '')}
                    ${createCard('Potential Fine from Overdue', formatCurrency(currentOverdueFines), 'currency', 'bg-orange-600', '')}
                    ${createCard('Currently Overdue Items', overdueIssues.length, 'alert', 'bg-red-600', '')}
                </div>
                <h4 class="text-lg font-semibold mb-3">List of Currently Overdue Books</h4>
                <div class="overflow-x-auto max-h-[400px] custom-scroll">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50 sticky top-0">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Book</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Calculated Fine</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${overdueRows || `<tr><td colspan="4" class="text-center py-4 text-green-500">No overdue books!</td></tr>`}
                        </tbody>
                    </table>
                </div>
            `;
        }

        function renderBookForm(bookId) { 
            const isEditing = !!bookId;
            pageTitle.textContent = isEditing ? "Edit Book Record" : "Add New Book";
            const book = isEditing ? SMS_DB.books.find(b => b.id === bookId) : { title: '', author: '', ISBN: '', copies: 0, available: 0 };
            
            const formHTML = `
                <div class="max-w-xl mx-auto bg-white p-8 rounded-xl shadow-2xl">
                    <h2 class="text-2xl font-bold mb-6 text-gray-800">${isEditing ? `Editing Book: ${book.title}` : 'Add New Book to Catalog'}</h2>
                    <form id="book-form" onsubmit="
                        (function(event, bookId) {
                            event.preventDefault();
                            const form = event.target;
                            const isEditing = !!bookId;
                            const totalCopies = parseInt(form.querySelector('#book-copies').value);
                            
                            let existingAvailable = 0;
                            let existingBookIndex = -1;

                            if (isEditing) {
                                existingBookIndex = SMS_DB.books.findIndex(b => b.id === bookId);
                                if (existingBookIndex !== -1) {
                                    const issued = SMS_DB.books[existingBookIndex].copies - SMS_DB.books[existingBookIndex].available;
                                    
                                    if (totalCopies < issued) {
                                        alert(\`Error: You cannot reduce the total copies below the \${issued} currently issued copies.\`);
                                        return;
                                    }
                                    existingAvailable = totalCopies - issued; 
                                }
                            } else {
                                existingAvailable = totalCopies;
                            }

                            const formData = {
                                id: bookId || generateUniqueId('B'),
                                title: form.querySelector('#book-title').value,
                                author: form.querySelector('#book-author').value,
                                ISBN: form.querySelector('#book-isbn').value,
                                copies: totalCopies,
                                available: existingAvailable
                            };

                            if (isEditing && existingBookIndex !== -1) {
                                SMS_DB.books[existingBookIndex] = formData;
                            } else if (!isEditing) {
                                SMS_DB.books.push(formData);
                            }
                            
                            saveData();
                            navigate('library', { subView: 'catalog' });
                        })(event, '${bookId || ''}')
                    ">
                        <div class="space-y-4">
                            <div><label class="block text-sm font-medium text-gray-700">Title</label><input type="text" id="book-title" value="${book.title}" required class="mt-1 block w-full rounded-md border p-3"></div>
                            <div><label class="block text-sm font-medium text-gray-700">Author</label><input type="text" id="book-author" value="${book.author}" required class="mt-1 block w-full rounded-md border p-3"></div>
                            <div><label class="block text-sm font-medium text-gray-700">ISBN</label><input type="text" id="book-isbn" value="${book.ISBN}" required class="mt-1 block w-full rounded-md border p-3"></div>
                            <div><label class="block text-sm font-medium text-gray-700">Total Copies</label><input type="number" id="book-copies" value="${book.copies}" required min="1" class="mt-1 block w-full rounded-md border p-3"></div>
                            ${isEditing ? `<p class="text-sm text-gray-600 mt-2">Available: ${book.available}. Current issued count will be maintained.</p>` : ''}
                        </div>
                        <div class="mt-8 pt-4 border-t flex justify-end space-x-4">
                            <button type="button" onclick="navigate('library')" class="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg">Cancel</button>
                            <button type="submit" class="bg-blue-600 text-white px-6 py-3 rounded-lg">${isEditing ? 'Save Changes' : 'Add Book'}</button>
                        </div>
                    </form>
                </div>
            `;

            contentContainer.innerHTML = formHTML;
        }

        function handleBatchInvoiceGeneration(event) {
            event.preventDefault();
            showLoading(true);

            const form = event.target;
            const selectedClass = form['batch-class-select'].value;
            const structureId = form['batch-structure-id'].value;
            const date = form['batch-inv-date'].value;

            if (!selectedClass || !structureId) {
                alert("Please select both a class and a fee structure.");
                showLoading(false);
                return;
            }

            const structure = SMS_DB.feeStructures.find(s => s.id === structureId);
            if (!structure) {
                alert("Fee structure not found.");
                showLoading(false);
                return;
            }

            const studentsInClass = SMS_DB.students.filter(s => s.class === selectedClass);
            let invoicesGenerated = 0;
            const amountDue = parseFloat(structure.amount.toFixed(2));
            
            if (studentsInClass.length === 0) {
                alert(`No students found in class ${selectedClass}.`);
                showLoading(false);
                return;
            }

            studentsInClass.forEach(student => {
                if (SMS_DB.invoices.some(inv => inv.studentId === student.id && inv.structureId === structureId)) {
                    return;
                }

                const newInvoice = {
                    id: generateUniqueId('INV'),
                    studentId: student.id,
                    structureId: structureId,
                    date: date,
                    amountDue: amountDue,
                    carriedForwardAmount: 0,
                    term: structure.term || '',
                    year: structure.year || SMS_DB.settings?.currentYear || new Date().getFullYear()
                };

                SMS_DB.invoices.push(newInvoice);
                newInvoice.carriedForwardAmount = carryForwardStudentBalance(student.id, newInvoice.id);
                invoicesGenerated++;
            });

            saveData();
            showLoading(false);
            
            if (invoicesGenerated > 0) {
                alert(`Successfully generated ${invoicesGenerated} new invoices for class ${selectedClass}.`);
            } else {
                alert(`No new invoices generated for class ${selectedClass}. All eligible students already have this invoice.`);
            }
            
            navigate('finance', { subView: 'invoicing' });
        }
        
        function filterPaymentsTable() {
            const filter = document.getElementById('payment-search-input').value.toUpperCase();
            const tableBody = document.getElementById('recent-payments-body');
            if (!tableBody) return;
            const rows = tableBody.getElementsByTagName('tr');
            
            for (let i = 0; i < rows.length; i++) {
                const studentCell = rows[i].getElementsByTagName('td')[1];
                
                if (studentCell) {
                    const studentText = studentCell.getAttribute('data-search') || studentCell.textContent || studentCell.innerText;
                    if (studentText.toUpperCase().indexOf(filter) > -1) {
                        rows[i].style.display = "";
                    } else {
                        rows[i].style.display = "none";
                    }
                }
            }
        }
        
        function filterInvoicesTable() {
            const filter = document.getElementById('invoice-search-input').value.toUpperCase();
            const tableBody = document.getElementById('all-invoices-body');
            if (!tableBody) return;
            const rows = tableBody.getElementsByTagName('tr');
            
            for (let i = 0; i < rows.length; i++) {
                const studentCell = rows[i].getElementsByTagName('td')[1];
                
                if (studentCell) {
                    const studentText = studentCell.getAttribute('data-search') || studentCell.textContent || studentCell.innerText;
                    if (studentText.toUpperCase().indexOf(filter) > -1) {
                        rows[i].style.display = "";
                    } else {
                        rows[i].style.display = "none";
                    }
                }
            }
        }
        
        function toggleCustomAmount(structureId) {
            const customContainer = document.getElementById('custom-amount-container');
            const customInput = document.getElementById('inv-custom-amount');
            
            if (structureId === 'CUSTOM_FEE') {
                customContainer.classList.remove('hidden');
                customInput.setAttribute('required', 'required');
            } else {
                customContainer.classList.add('hidden');
                customInput.removeAttribute('required');
                customInput.value = ''; 
            }
        }


        function renderFinance() {
            pageTitle.textContent = "Fees & Finance Management";
            
            const tabClass = (tab) => currentSubView === tab ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300';

            const financeHTML = `
                <div class="space-y-6">
                    <div class="flex border-b border-gray-300">
                        <button onclick="navigate('finance', { subView: 'invoicing' })" class="px-6 py-3 font-semibold rounded-t-lg ${tabClass('invoicing')}">Invoicing & Payments</button>
                        <button onclick="navigate('finance', { subView: 'structures' })" class="px-6 py-3 font-semibold rounded-t-lg ${tabClass('structures')}">Fee Structures</button>
                        <button onclick="navigate('finance', { subView: 'expenses' })" class="px-6 py-3 font-semibold rounded-t-lg ${tabClass('expenses')}">Expense Tracking</button>
                        <button onclick="navigate('finance', { subView: 'financial_reports' })" class="px-6 py-3 font-semibold rounded-t-lg ${tabClass('financial_reports')}">Financial Reports</button>
                    </div>

                    <div id="finance-subcontent" class="bg-white p-6 rounded-b-xl shadow-lg">
                        ${currentSubView === 'structures' ? renderFeeStructures() : 
                          currentSubView === 'expenses' ? renderExpenseTracking() :
                          currentSubView === 'financial_reports' ? renderFinancialReports() :
                          renderInvoicing()}
                    </div>
                </div>
            `;
            contentContainer.innerHTML = financeHTML;
        }

        function renderFeeStructures() {
            const structures = (SMS_DB.feeStructures || []).filter(s => s.id !== 'FS-CUSTOM');
            
            const allClasses = [...new Set([...(SMS_DB.settings?.classes || []), ...(SMS_DB.students?.map(s => s.class) || [])])].filter(c => c).sort();
            const classesOptions = allClasses.map(c => `<option value="${c}">${c}</option>`).join('');
            
            
            const termsOptions = GRADING_TERMS.map(t => `<option value="${t}" ${t === SMS_DB.settings.currentTerm ? 'selected' : ''}>${t}</option>`).join('');

            const structureRows = structures.map(s => `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="px-4 py-3">${s.id}</td>
                    <td class="px-4 py-3 font-medium">${s.name}</td>
                    <td class="px-4 py-3">${s.class}</td>
                    <td class="px-4 py-3">${s.term} (${s.year})</td>
                    <td class="px-4 py-3 font-bold">${formatCurrency(s.amount)}</td>
                    <td class="px-4 py-3">
                        <button onclick="deleteFeeStructure('${s.id}')" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
                    </td>
                </tr>
            `).join('');

            return `
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-1 bg-gray-50 p-6 rounded-lg border shadow-inner h-fit">
                        <h3 class="text-xl font-semibold mb-4 text-blue-800">Define New Fee Structure</h3>
                        <form id="structure-form" onsubmit="handleFeeStructureSubmission(event)">
                            <div class="space-y-3">
                                <input type="text" id="fs-name" placeholder="Structure Name (e.g., Grade 9 T2)" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                <select id="fs-class" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                    <option value="">Select Class</option>${classesOptions}
                                </select>
                                <select id="fs-term" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                    ${termsOptions}
                                </select>
                                <input type="number" id="fs-year" value="${SMS_DB.settings.currentYear}" required min="2020" max="2050" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                <input type="number" id="fs-amount" placeholder="Base Amount Due (e.g., 50000)" required min="1" step="0.01" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                            </div>
                            <button type="submit" class="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-md">
                                Add Structure
                            </button>
                        </form>
                    </div>
                    <div class="lg:col-span-2">
                        <h3 class="text-xl font-semibold mb-4 text-gray-800">Current Fee Structures (${structures.length})</h3>
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                        <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    ${structureRows || `<tr><td colspan="6" class="text-center py-4 text-gray-500">No fee structures defined.</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }
        
        function handleFeeStructureSubmission(event) {
            event.preventDefault();
            const form = event.target;
            const formData = {
                id: generateUniqueId('FS'),
                name: form['fs-name'].value,
                class: form['fs-class'].value,
                term: form['fs-term'].value,
                year: parseInt(form['fs-year'].value),
                amount: parseFloat(form['fs-amount'].value)
            };

            if ((SMS_DB.feeStructures || []).some(s => s.class === formData.class && s.term === formData.term && s.year === formData.year && s.id !== 'FS-CUSTOM')) {
                alert("Error: A fee structure already exists for this class/term/year.");
                return;
            }

            SMS_DB.feeStructures.push(formData);
            saveData();
            form.reset();
            navigate('finance', { subView: 'structures' }); 
        }
        
        function deleteFeeStructure(fsId) {
            if (fsId === 'FS-CUSTOM') {
                alert("The Custom Fee Structure placeholder cannot be deleted.");
                return;
            }
            if (SMS_DB.invoices.some(inv => inv.structureId === fsId)) {
                alert("Cannot delete this fee structure. It is currently linked to existing invoices.");
                return;
            }
            if (confirm("Are you sure you want to delete this fee structure?")) {
                SMS_DB.feeStructures = SMS_DB.feeStructures.filter(s => s.id !== fsId);
                saveData();
                navigate('finance', { subView: 'structures' }); 
            }
        }

        function renderInvoicing() {
            const studentsWithBalance = (SMS_DB.students || []).map(s => {
                const balance = calculateStudentBalance(s.id);
                return { ...s, balance };
            }).filter(s => Math.abs(s.balance) > 0.01); 

            const allInvoices = (SMS_DB.invoices || []).map(getInvoiceDetails).sort((a, b) => new Date(b.date) - new Date(a.date));

            const searchableStudentSelect = createSearchableStudentSelect('inv-student-id');
            const structureOptions = (SMS_DB.feeStructures || [])
                .filter(s => s.id !== 'FS-CUSTOM') 
                .map(s => `<option value="${s.id}">${s.name} (${formatCurrency(s.amount)})</option>`).join('');

            const uniqueClasses = [...new Set([...(SMS_DB.settings?.classes || []), ...(SMS_DB.students?.map(s => s.class) || [])])].filter(c => c).sort();
            const classesOptions = uniqueClasses.map(c => `<option value="${c}">${c}</option>`).join('');


            const invoiceRows = allInvoices.map(inv => {
                let statusClass = 'text-gray-600';
                if (inv.balance > 0.01) statusClass = 'text-red-600 font-bold';
                else if (inv.balance < -0.01) statusClass = 'text-green-600 font-bold';
                else if (inv.balance >= -0.01 && inv.balance <= 0.01) statusClass = 'text-green-600';

                const structureDisplay = inv.structureId === 'FS-CUSTOM' ? `Custom Fee (INV: ${formatCurrency(inv.amountDue)})` : inv.structureName;
                const searchData = `${inv.studentName.toUpperCase()} ${inv.studentId}`;


                return `
                    <tr class="hover:bg-gray-50 border-b">
                        <td class="px-3 py-3 text-sm">${inv.id}</td>
                        <td class="px-3 py-3" data-search="${searchData}">${inv.studentName} (${inv.studentId})</td>
                        <td class="px-3 py-3">${structureDisplay}</td>
                        <td class="px-3 py-3">${formatCurrency(inv.netDue)}</td>
                        <td class="px-3 py-3 text-right ${statusClass}">${formatCurrency(inv.balance)}</td>
                        <td class="px-3 py-3">
                            <button onclick="promptPayment('${inv.id}')" class="text-green-600 hover:text-green-800 text-sm mr-2" ${inv.balance <= 0.01 ? 'disabled' : ''}>Pay</button>
                            <button onclick="promptBursary('${inv.id}')" class="text-purple-600 hover:text-purple-800 text-sm">Bursary</button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            const balanceRows = studentsWithBalance.map(s => {
                const color = s.balance > 0 ? 'text-red-600 font-bold' : 'text-green-600';
                return `
                    <tr class="hover:bg-gray-50 border-b">
                        <td class="px-4 py-2">${s.name}</td>
                        <td class="px-4 py-2">${s.class}</td>
                        <td class="px-4 py-2 ${color}">${formatCurrency(s.balance)}</td>
                    </tr>
                `;
            }).join('');
            
            const allPaymentsData = (SMS_DB.payments || []).map(p => {
                const inv = SMS_DB.invoices.find(i => i.id === p.invoiceId);
                const studentId = inv ? inv.studentId : 'N/A';
                const student = SMS_DB.students.find(s => s.id === studentId);
                
                const receiptAction = p.receiptData 
                    ? `<button onclick="generatePaymentReceipt('${p.id}')" class="text-blue-600 hover:text-blue-800 text-xs font-semibold">View Receipt</button>` 
                    : `<button onclick="generatePaymentReceipt('${p.id}')" class="text-indigo-600 hover:text-indigo-800 text-xs font-semibold">Generate Receipt</button>`;
                
                return {
                    ...p,
                    studentName: student ? student.name : 'Unknown',
                    studentId: studentId,
                    receiptAction: receiptAction
                };
            }).sort((a, b) => new Date(b.date) - new Date(a.date)); 


            const paymentRows = allPaymentsData.map(p => {
                return `
                    <tr class="hover:bg-gray-50 border-b">
                        <td class="px-3 py-2 text-xs">${formatDate(p.date)}</td>
                        <td class="px-3 py-2 text-sm" data-search="${p.studentName.toUpperCase()} ${p.studentId}">${p.studentName} (${p.studentId})</td>
                        <td class="px-3 py-2 text-sm">${formatCurrency(p.amount)}</td>
                        <td class="px-3 py-2">${p.method}</td>
                        <td class="px-3 py-2">
                            ${p.receiptAction}
                        </td>
                    </tr>
                `;
            }).join('');
            
            const batchInvoiceForm = `
                <div class="bg-indigo-50 p-6 rounded-lg border shadow-inner">
                    <h3 class="text-xl font-semibold mb-4 text-indigo-800">Batch Invoice by Class</h3>
                    <form id="batch-invoice-form" onsubmit="handleBatchInvoiceGeneration(event)">
                        <div class="space-y-3">
                            <label for="batch-class-select" class="block text-sm font-medium text-gray-700">Select Class</label>
                            <select id="batch-class-select" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                <option value="">-- Select Class --</option>
                                ${classesOptions}
                            </select>
                            
                            <label for="batch-structure-id" class="block text-sm font-medium text-gray-700">Select Fee Structure</label>
                            <select id="batch-structure-id" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                <option value="">-- Select Standard Fee --</option>
                                ${structureOptions}
                            </select>

                            <label for="batch-inv-date" class="block text-sm font-medium text-gray-700">Invoice Date</label>
                            <input type="date" id="batch-inv-date" value="${new Date().toISOString().split('T')[0]}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                            
                        </div>
                        <button type="submit" class="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-md">
                            Generate Batch Invoices
                        </button>
                    </form>
                </div>
            `;


            return `
                <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div class="lg:col-span-1 space-y-6">
                        <div class="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                            <h3 class="text-lg font-semibold mb-3 text-yellow-800">Outstanding Balances (${studentsWithBalance.length})</h3>
                            <div class="overflow-y-auto max-h-48 custom-scroll">
                                <table class="min-w-full text-sm">
                                    <thead class="bg-yellow-100 sticky top-0"><tr><th class="px-4 py-2 text-left">Student</th><th class="px-4 py-2 text-left">Class</th><th class="px-4 py-2 text-left">Balance</th></tr></thead>
                                    <tbody>${balanceRows || `<tr><td colspan="3" class="text-center py-2 text-gray-500">All cleared!</td></tr>`}</tbody>
                                </table>
                            </div>
                        </div>
                        
                        <div class="bg-gray-50 p-6 rounded-lg border shadow-inner">
                            <h3 class="text-xl font-semibold mb-4 text-indigo-800">Generate New Invoice (Single Student)</h3>
                            <form id="invoice-form" onsubmit="handleInvoiceGeneration(event)">
                                <div class="space-y-3">
                                    ${searchableStudentSelect}
                                    <label class="block text-sm font-medium text-gray-700 mt-2">Select Structure or Custom Fee</label>
                                    <select id="inv-structure-id" onchange="toggleCustomAmount(this.value)" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                        <option value="">-- Select Standard Fee --</option>
                                        ${structureOptions}
                                        <option value="CUSTOM_FEE">-- Custom Fee Item (Per Student) --</option>
                                    </select>

                                    <div id="custom-amount-container" class="hidden">
                                        <label class="block text-sm font-medium text-gray-700">Custom Amount Due (KSh)</label>
                                        <input type="number" id="inv-custom-amount" step="0.01" placeholder="Enter Amount" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                    </div>
                                    
                                    <input type="date" id="inv-date" value="${new Date().toISOString().split('T')[0]}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                </div>
                                <button type="submit" class="mt-4 w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md">
                                    Generate Single Invoice
                                </button>
                            </form>
                        </div>

                        ${batchInvoiceForm}
                        
                        <div class="bg-green-50 p-4 rounded-lg border border-green-200">
                            <h3 class="text-lg font-semibold mb-3 text-green-800">Payment History (${allPaymentsData.length})</h3>
                            
                             <div class="mb-3">
                                <input type="text" id="payment-search-input" oninput="filterPaymentsTable()" placeholder="Search payment by Student Name or Adm. No..." class="w-full p-2 border rounded-lg text-sm">
                            </div>
                            
                            <div class="overflow-y-auto max-h-96 custom-scroll">
                                <table class="min-w-full">
                                    <thead class="bg-green-100 sticky top-0"><tr><th class="px-3 py-2 text-left text-xs">Date</th><th class="px-3 py-2 text-left text-xs">Student</th><th class="px-3 py-2 text-left text-xs">Amount</th><th class="px-3 py-2 text-left text-xs">Method</th><th class="px-3 py-2 text-left text-xs">Receipt</th></tr></thead>
                                    <tbody id="recent-payments-body">${paymentRows || `<tr><td colspan="5" class="text-center py-2 text-gray-500">No payments recorded.</td></tr>`}</tbody>
                                </table>
                            </div>
                        </div>
                        
                    </div>
                    <div class="lg:col-span-3">
                        <h3 class="text-xl font-semibold mb-2 text-gray-800">All Generated Invoices (${allInvoices.length})</h3>
                        <p class="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">Outstanding balances are automatically carried forward when a new invoice is created for the learner. Previous invoices remain as history and the transferred amount is not counted twice.</p>
                        
                        <div class="mb-3">
                            <input type="text" id="invoice-search-input" oninput="filterInvoicesTable()" placeholder="Search invoices by Student Name or Adm. No..." class="w-full p-2 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
                        </div>
                        
                        <div class="overflow-x-auto max-h-[600px] custom-scroll">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">INV ID</th>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fee Type</th>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net Due</th>
                                        <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                                        <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200" id="all-invoices-body">
                                    ${invoiceRows || `<tr><td colspan="6" class="text-center py-4 text-gray-500">No invoices generated yet.</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }

        function handleInvoiceGeneration(event) {
            event.preventDefault();
            const form = event.target;
            const studentId = form['inv-student-id'].value;
            let structureId = form['inv-structure-id'].value;
            const customAmountInput = document.getElementById('inv-custom-amount');
            const date = form['inv-date'].value;
            let amountDue;

            if (!studentId) {
                alert("Please select a valid student.");
                return;
            }
            
            if (structureId === 'CUSTOM_FEE') {
                amountDue = parseFloat(customAmountInput.value);
                if (isNaN(amountDue) || amountDue <= 0) {
                    alert("Please enter a valid custom amount.");
                    return;
                }
                structureId = 'FS-CUSTOM'; 
            } else if (structureId) {
                const structure = SMS_DB.feeStructures.find(s => s.id === structureId);
                if (!structure) {
                    alert("Selected fee structure not found.");
                    return;
                }
                amountDue = structure.amount; 
                
                const overrideAmount = parseFloat(customAmountInput.value);
                if (!isNaN(overrideAmount) && overrideAmount > 0) {
                    amountDue = overrideAmount;
                }
            } else {
                alert("Please select a fee structure or custom fee type.");
                return;
            }

            if (structureId !== 'FS-CUSTOM' && SMS_DB.invoices.some(inv => inv.studentId === studentId && inv.structureId === structureId)) {
                 alert("This student already has an invoice for this specific standard fee structure.");
                 return;
            }
            
            amountDue = parseFloat(amountDue.toFixed(2));


            const newInvoice = {
                id: generateUniqueId('INV'),
                studentId: studentId,
                structureId: structureId, 
                date: date,
                amountDue: amountDue,
                carriedForwardAmount: 0,
                term: (SMS_DB.feeStructures.find(s => s.id === structureId)?.term || ''),
                year: (SMS_DB.feeStructures.find(s => s.id === structureId)?.year || SMS_DB.settings?.currentYear || new Date().getFullYear())
            };

            SMS_DB.invoices.push(newInvoice);
            newInvoice.carriedForwardAmount = carryForwardStudentBalance(studentId, newInvoice.id);
            saveData();
            navigate('finance', { subView: 'invoicing' }); 
        }

        function promptPayment(invoiceId) {
            const invoice = SMS_DB.invoices.find(i => i.id === invoiceId);
            if (!invoice) return;
            const invoiceDetails = getInvoiceDetails(invoice);
            
            if (invoiceDetails.balance <= 0.01) {
                alert("This invoice is already fully paid or in credit.");
                return;
            }
            
            const maxPayment = invoiceDetails.balance;


            const paymentAmount = prompt(`Enter payment amount (Max: ${formatCurrency(maxPayment)}):`);
            const amount = parseFloat(paymentAmount);

            if (isNaN(amount) || amount <= 0) return;
            if (amount > maxPayment + 0.01) {
                alert(`Payment amount exceeds the outstanding balance (${formatCurrency(maxPayment)}).`);
                return;
            }
            
            const method = prompt("Enter payment method (e.g., Cash, Bank Transfer, M-Pesa):") || 'Unknown';

            const newPayment = {
                id: generateUniqueId('PAY'),
                invoiceId: invoiceId,
                date: new Date().toISOString().split('T')[0],
                amount: amount,
                method: method,
                receiptData: null 
            };

            SMS_DB.payments.push(newPayment);
            saveData();
            navigate('finance', { subView: 'invoicing' }); 
        }
        
        function promptBursary(invoiceId) {
            const invoice = SMS_DB.invoices.find(i => i.id === invoiceId);
            if (!invoice) return;
            const invoiceDetails = getInvoiceDetails(invoice);
            
            const maxBursary = invoiceDetails.netDue - invoiceDetails.totalPayments;
            
            if (maxBursary <= 0.01) {
                alert("Cannot apply a bursary/discount. The invoice is already covered or overpaid.");
                return;
            }

            const bursaryAmount = prompt(`Enter Bursary/Scholarship amount (Max: ${formatCurrency(maxBursary)}):`);
            const amount = parseFloat(bursaryAmount);

            if (isNaN(amount) || amount <= 0) return;
            if (amount > maxBursary + 0.01) {
                alert(`Bursary amount cannot exceed the current total remaining balance (${formatCurrency(maxBursary)}).`);
                return;
            }
            
            const reason = prompt("Enter reason for the Bursary/Discount:") || 'Bursary/Scholarship';

            const newBursary = {
                id: generateUniqueId('BUR'),
                studentId: invoiceDetails.studentId,
                invoiceId: invoiceId,
                date: new Date().toISOString().split('T')[0],
                amount: amount,
                reason: reason
            };

            SMS_DB.bursaries.push(newBursary);
            saveData();
            navigate('finance', { subView: 'invoicing' }); 
        }

        function generatePaymentReceipt(paymentId) {
            showLoading();
            const paymentIndex = SMS_DB.payments.findIndex(p => p.id === paymentId);

            if (paymentIndex === -1) {
                alert("Payment record not found.");
                showLoading(false);
                return;
            }
            const payment = SMS_DB.payments[paymentIndex];

            let receiptContent = payment.receiptData;
            let receiptTitle = "Payment Receipt - " + payment.id;

            if (!receiptContent) {
                const invoice = SMS_DB.invoices.find(i => i.id === payment.invoiceId);
                if (!invoice) {
                    alert("Associated invoice not found.");
                    showLoading(false);
                    return;
                }

                const student = SMS_DB.students.find(s => s.id === invoice.studentId);
                const structure = SMS_DB.feeStructures.find(s => s.id === invoice.structureId);
                
                const invoiceDetails = getInvoiceDetails(invoice); 

                const totalPaymentsBefore = SMS_DB.payments
                    .filter(p => p.invoiceId === invoice.id && p.id !== payment.id)
                    .reduce((sum, p) => sum + p.amount, 0);

                const balanceAfterPayment = invoiceDetails.netDue - (totalPaymentsBefore + payment.amount);

                const feeItemName = structure?.name || `Custom Fee (INV: ${formatCurrency(invoice.amountDue)})`;


                receiptContent = `
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ccc; font-family: sans-serif;">
                        <h2 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 20px; text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; color: #1e40af;">Official Payment Receipt</h2>
                        
                        <div style="margin-bottom: 15px; border-bottom: 1px dashed #ddd; padding-bottom: 10px;">
                            <p style="margin: 5px 0;"><strong style="width: 150px; display: inline-block;">Receipt ID:</strong> ${payment.id}</p>
                            <p style="margin: 5px 0;"><strong style="width: 150px; display: inline-block;">Date:</strong> ${formatDate(payment.date)}</p>
                            <p style="margin: 5px 0;"><strong style="width: 150px; display: inline-block;">Payment Method:</b> ${payment.method}</p>
                        </div>

                        <h3 style="font-size: 1.25rem; font-weight: bold; margin-top: 20px; margin-bottom: 10px;">Student Details</h3>
                        <div style="border: 1px solid #eee; padding: 10px; background-color: #f9f9f9;">
                            <p style="margin: 5px 0;"><strong style="width: 150px; display: inline-block;">Student Name:</strong> ${student?.name || 'N/A'}</p>
                            <p style="margin: 5px 0;"><strong style="width: 150px; display: inline-block;">Admission No:</strong> ${student?.id || 'N/A'}</p>
                            <p style="margin: 5px 0;"><strong style="width: 150px; display: inline-block;">Class:</strong> ${student?.class || 'N/A'}</p>
                        </div>

                        <h3 style="font-size: 1.25rem; font-weight: bold; margin-top: 20px; margin-bottom: 10px;">Fee & Invoice Details</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
                            <thead style="background-color: #e5e7eb;">
                                <tr><th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Fee Item</th><th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Invoice ID</th><th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Net Due</th></tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${feeItemName}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${invoice.id}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${formatCurrency(invoiceDetails.netDue)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <h3 style="font-size: 1.25rem; font-weight: bold; margin-top: 20px; margin-bottom: 10px; color: #10b981;">Transaction Summary</h3>
                        <div style="border: 2px solid #10b981; padding: 15px; background-color: #d1fae5;">
                            <p style="margin: 5px 0; font-size: 1.4rem;"><strong style="width: 200px; display: inline-block;">AMOUNT PAID:</strong> <span style="font-weight: bold; float: right;">${formatCurrency(payment.amount)}</span></p>
                        </div>

                        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #ddd;">
                            <p style="margin: 5px 0;"><strong style="width: 200px; display: inline-block;">Total Paid (Including This Receipt):</strong> <span style="float: right;">${formatCurrency(totalPaymentsBefore + payment.amount)}</span></p>
                            <p style="margin: 5px 0;"><strong style="width: 200px; display: inline-block;">Remaining Balance:</strong> <span style="font-weight: bold; color: ${balanceAfterPayment > 0.01 ? 'red' : (balanceAfterPayment < -0.01 ? 'green' : 'black')}; float: right;">${formatCurrency(parseFloat(balanceAfterPayment.toFixed(2)))}</span></p>
                        </div>
                        
                        <p style="text-align: center; margin-top: 30px; font-size: 0.8rem; color: #666;">This is a system-generated receipt. Thank you for your payment.</p>
                    </div>
                `;

                SMS_DB.payments[paymentIndex].receiptData = receiptContent;
                saveData();
            }
            
            showLoading(false);
            preparePrintLayout(receiptTitle, receiptContent);
            
            if (currentView === 'finance' && currentSubView === 'invoicing') {
                 navigate('finance', { subView: 'invoicing' });
            }
        }

        function renderExpenseTracking() {
            const expenses = (SMS_DB.expenses || []).sort((a, b) => new Date(b.date) - new Date(a.date));
            const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
            
            const expenseRows = expenses.map(e => `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="px-4 py-3">${formatDate(e.date)}</td>
                    <td class="px-4 py-3 font-medium">${e.category}</td>
                    <td class="px-4 py-3">${e.description}</td>
                    <td class="px-4 py-3 font-bold text-red-700">${formatCurrency(e.amount)}</td>
                    <td class="px-4 py-3">
                        <button onclick="deleteExpense('${e.id}')" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
                    </td>
                </tr>
            `).join('');
            
            const categories = ['Salaries', 'Utilities', 'Maintenance', 'Supplies', 'Other'];
            const categoryOptions = categories.map(c => `<option value="${c}">${c}</option>`).join('');

            return `
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-1 bg-gray-50 p-6 rounded-lg border shadow-inner h-fit">
                        <h3 class="text-xl font-semibold mb-4 text-red-800">Record New Expense</h3>
                        <form id="expense-form" onsubmit="handleExpenseSubmission(event)">
                            <div class="space-y-3">
                                <input type="date" id="exp-date" value="${new Date().toISOString().split('T')[0]}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                <select type="text" id="exp-category" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                                    <option value="">Select Category</option>${categoryOptions}
                                    </select>
                                <textarea id="exp-description" placeholder="Description of expense" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"></textarea>
                                <input type="number" id="exp-amount" placeholder="Amount (e.g., 15000)" required min="0.01" step="0.01" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">
                            </div>
                            <button type="submit" class="mt-4 w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-md">
                                Record Expense
                            </button>
                        </form>
                    </div>
                    <div class="lg:col-span-2">
                        <h3 class="text-xl font-semibold mb-4 text-gray-800">Expense History | Total: ${formatCurrency(totalExpenses)}</h3>
                        <div class="overflow-x-auto max-h-[600px] custom-scroll">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    ${expenseRows || `<tr><td colspan="5" class="text-center py-4 text-gray-500">No expenses recorded yet.</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }
        
        function handleExpenseSubmission(event) {
            event.preventDefault();
            const form = event.target;
            const newExpense = {
                id: generateUniqueId('EXP'),
                date: form['exp-date'].value,
                category: form['exp-category'].value,
                description: form['exp-description'].value,
                amount: parseFloat(form['exp-amount'].value)
            };
            SMS_DB.expenses.push(newExpense);
            saveData();
            form.reset();
            navigate('finance', { subView: 'expenses' }); 
        }
        
        function deleteExpense(expId) {
            if (confirm("Are you sure you want to delete this expense record?")) {
                SMS_DB.expenses = SMS_DB.expenses.filter(e => e.id !== expId);
                saveData();
                navigate('finance', { subView: 'expenses' }); 
            }
        }

        function renderFinancialReports() {
            const totalInvoiced = (SMS_DB.invoices || []).reduce((sum, inv) => sum + Number(inv.amountDue || 0) + Number(inv.carriedForwardAmount || 0), 0);
            const totalPayments = (SMS_DB.payments || []).reduce((sum, pay) => sum + pay.amount, 0);
            const totalBursary = (SMS_DB.bursaries || []).reduce((sum, bur) => sum + bur.amount, 0);
            const totalExpenses = (SMS_DB.expenses || []).reduce((sum, exp) => sum + exp.amount, 0);
            
            const netInvoiced = totalInvoiced - totalBursary;
            const netOutstanding = netInvoiced - totalPayments;
            const netIncome = totalPayments - totalExpenses; 
            
            const studentSummaries = (SMS_DB.students || []).map(s => getStudentPaymentSummary(s.id));
            const topOwed = studentSummaries
                .filter(s => s.balance > 0.01)
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 5);

            const owedRows = topOwed.map(s => `
                <tr class="border-b">
                    <td class="px-4 py-2">${s.name}</td>
                    <td class="px-4 py-2">${s.class}</td>
                    <td class="px-4 py-2 text-red-600 font-semibold">${formatCurrency(s.balance)}</td>
                </tr>
            `).join('');

            return `
                <h3 class="2xl font-semibold mb-6 text-indigo-800">Financial Summary Overview (${SMS_DB.settings.currentYear || 'N/A'})</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    ${createCard('Total Fees Invoiced', formatCurrency(totalInvoiced), 'currency', 'bg-blue-600', '')}
                    ${createCard('Total Payments Received', formatCurrency(totalPayments), 'trending-up', 'bg-green-600', '')}
                    ${createCard('Total Operating Expenses', formatCurrency(totalExpenses), 'minus', 'bg-red-600', '')}
                    ${createCard('Net Outstanding Balance', formatCurrency(netOutstanding), 'alert', 'bg-orange-600', 'navigate("finance", { subView: "invoicing" })')}
                </div>
                
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div class="bg-gray-50 p-6 rounded-xl shadow-lg border">
                        <h4 class="text-xl font-semibold mb-4">Cash Flow Snapshot (Payments vs Expenses)</h4>
                        <div class="space-y-4">
                            <div class="flex justify-between items-center p-3 rounded-lg bg-green-100">
                                <span>Total Payments</span>
                                <span class="font-bold text-green-700">${formatCurrency(totalPayments)}</span>
                            </div>
                            <div class="flex justify-between items-center p-3 rounded-lg bg-red-100">
                                <span>Total Expenses</span>
                                <span class="font-bold text-red-700">${formatCurrency(totalExpenses)}</span>
                            </div>
                            <div class="flex justify-between items-center p-4 rounded-lg font-extrabold ${netIncome >= 0 ? 'bg-blue-200 text-blue-800' : 'bg-red-200 text-red-800'}">
                                <span>Net Operating Cash Flow</span>
                                <span>${formatCurrency(netIncome)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-yellow-50 p-6 rounded-xl shadow-lg border">
                        <h4 class="text-xl font-semibold mb-4 text-yellow-800">Top 5 Students with Outstanding Fees</h4>
                        <table class="min-w-full text-sm">
                            <thead class="bg-yellow-100"><tr><th class="px-4 py-2 text-left">Student</th><th class="px-4 py-2 text-left">Class</th><th class="px-4 py-2 text-left">Balance</th></tr></thead>
                            <tbody>
                                ${owedRows || `<tr><td colspan="3" class="text-center py-4 text-gray-500">No major outstanding balances.</td></tr>`}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-xl shadow-lg mt-8 border border-gray-200">
                    <h3 class="text-2xl font-semibold mb-4 text-gray-800 border-b pb-2">Financial Data Management</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <button onclick="exportFinanceData()" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition duration-200 shadow-md flex items-center justify-center">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            Export All Finance Data (JSON)
                        </button>
                        <button onclick="showImportFinanceModal()" class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition duration-200 shadow-md flex items-center justify-center">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            Import Finance Data (JSON)
                        </button>
                    </div>
                </div>
            `;
        }

        function exportFinanceData() {
            showLoading(true);
            const financeData = {
                feeStructures: SMS_DB.feeStructures,
                invoices: SMS_DB.invoices,
                payments: SMS_DB.payments,
                bursaries: SMS_DB.bursaries,
                expenses: SMS_DB.expenses,
            };

            const dataStr = JSON.stringify(financeData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Mabasi_Finance_Export_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showLoading(false);
            alert("Finance data exported successfully.");
        }

        function showImportFinanceModal() {
            financeImportModal.classList.remove('hidden');
            document.getElementById('finance-import-status').textContent = '';
            document.getElementById('finance-json-file').value = '';
        }

        function importFinanceData(event) {
            event.preventDefault();
            showLoading(true);
            const fileInput = document.getElementById('finance-json-file');
            const file = fileInput.files[0];
            const statusDiv = document.getElementById('finance-import-status');

            if (!file) {
                statusDiv.textContent = 'Please select a JSON file.';
                statusDiv.classList.add('text-red-500');
                showLoading(false);
                return;
            }

            statusDiv.textContent = 'Processing...';
            statusDiv.classList.remove('text-red-500', 'text-green-600');
            statusDiv.classList.add('text-blue-500');

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const importedData = JSON.parse(e.target.result);
                    
                    // Validate structure - check for expected top-level keys
                    const requiredKeys = ['feeStructures', 'invoices', 'payments', 'bursaries', 'expenses'];
                    const missingKeys = requiredKeys.filter(key => !Array.isArray(importedData[key]));

                    if (missingKeys.length > 0) {
                        throw new Error(`Invalid file structure. Missing or malformed keys: ${missingKeys.join(', ')}. Please ensure all finance data arrays are present.`);
                    }

                    // Confirm overwrite
                    if (!confirm("WARNING: Importing this data will overwrite ALL existing fee structures, invoices, payments, bursaries, and expenses. Do you want to proceed?")) {
                         statusDiv.textContent = 'Import cancelled by user.';
                         statusDiv.classList.remove('text-blue-500');
                         statusDiv.classList.add('text-yellow-600');
                         showLoading(false);
                         return;
                    }

                    // Perform the overwrite
                    SMS_DB.feeStructures = importedData.feeStructures;
                    SMS_DB.invoices = importedData.invoices;
                    SMS_DB.payments = importedData.payments;
                    SMS_DB.bursaries = importedData.bursaries;
                    SMS_DB.expenses = importedData.expenses;
                    
                    // Ensure the 'FS-CUSTOM' placeholder is always present after import
                    if (!SMS_DB.feeStructures.some(s => s.id === 'FS-CUSTOM')) {
                        SMS_DB.feeStructures.push({ id: 'FS-CUSTOM', name: 'Custom Fee/Ad-Hoc Charge', class: 'ALL', term: 'N/A', year: SMS_DB.settings.currentYear, amount: 0 });
                    }

                    saveData();
                    statusDiv.textContent = 'Finance data imported successfully!';
                    statusDiv.classList.remove('text-blue-500');
                    statusDiv.classList.add('text-green-600');
                    
                    setTimeout(() => {
                        financeImportModal.classList.add('hidden');
                        navigate('finance', { subView: currentSubView }); // Re-render finance view
                    }, 1500);

                } catch (error) {
                    console.error("Error importing finance data:", error);
                    statusDiv.textContent = `Error importing data: ${error.message}`;
                    statusDiv.classList.remove('text-blue-500');
                    statusDiv.classList.add('text-red-500');
                } finally {
                    showLoading(false);
                }
            };
            reader.readAsText(file);
        }

        function renderReports() {
            pageTitle.textContent = "School Reports and Data Export";
            
            const reportsHTML = `
                <div class="space-y-8">
                    <h2 class="text-3xl font-bold text-gray-900">School Reporting Console</h2>
                    <div class="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg"><strong>Financial records are protected.</strong> Fee balances, payment reports, invoices and other financial reports are available only from the <strong>Finance → Financial Reports</strong> section.</div>

                    <div class="bg-white p-6 rounded-xl shadow-lg border border-red-100">
                        <h3 class="text-2xl font-semibold mb-4 text-red-700 border-b pb-2">Leave/Out Reports (Filterable by Class)</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="p-4 border rounded-lg hover:bg-red-50 cursor-pointer" onclick="showReportFilterModal('leave_report', 'Generate Active Leave Roster', 'Generate Leave Roster')">
                                <p class="font-medium text-gray-800">Active Leave Roster (Print)</p>
                                <p class="text-sm text-gray-500">List all students currently authorized to be away from school.</p>
                            </div>
                        </div>
                    </div>


                    <div class="bg-white p-6 rounded-xl shadow-lg border border-purple-100">
                        <h3 class="text-2xl font-semibold mb-4 text-purple-700 border-b pb-2">Library Reports</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="p-4 border rounded-lg hover:bg-purple-50 cursor-pointer" onclick="generateOverdueBookReport()">
                                <p class="font-medium text-gray-800">Overdue Books & Fines Report (Print)</p>
                                <p class="text-sm text-gray-500">List all currently overdue books and associated fines (system-wide).</p>
                            </div>
                            <div class="p-4 border rounded-lg hover:bg-purple-50 cursor-pointer" onclick="alert('Book usage statistics feature not implemented in this demo.')">
                                <p class="font-medium text-gray-800">Book Usage Statistics (Stub)</p>
                                <p class="text-sm text-gray-500">Statistics on most popular and least used books.</p>
                            </div>
                        </div>
                    </div>

                    <div class="text-center mt-8">
                        <p class="text-gray-600">Note: Print reports simulate the PDF/CSV data export function.</p>
                    </div>
                </div>
            `;
            contentContainer.innerHTML = reportsHTML;
        }

        function preparePrintLayout(title, contentHTML) {
            pdfContainer.innerHTML = `
                <div class="print-sheet">
                    <h1 style="font-size: 2rem; font-weight: bold; margin-bottom: 1.5rem; text-align: center;">${title}</h1>
                    <p style="margin-bottom: 1rem; font-size: 0.875rem; text-align: right;">Generated: ${formatDate(new Date().toISOString().split('T')[0])} | ${SCHOOL_NAME} Report</p>
                    <div class="report-content">${contentHTML}</div>
                </div>
            `;
            window.print();
             setTimeout(() => {
                pdfContainer.innerHTML = '';
             }, 100);
        }

        function generateActiveLeaveReport(classFilter = 'ALL') {
            showLoading();
            
            let activeLeaves = (SMS_DB.leaves || []).filter(l => l.status === 'Active').map(l => {
                const student = SMS_DB.students.find(s => s.id === l.studentId);
                const isOverdue = new Date(l.expectedReturn + 'T00:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
                return { ...l, studentName: student?.name || 'Unknown', studentClass: student?.class || 'N/A', isOverdue };
            });
            
            if (classFilter !== 'ALL') {
                activeLeaves = activeLeaves.filter(l => l.studentClass === classFilter);
            }

            activeLeaves.sort((a, b) => new Date(a.expectedReturn) - new Date(b.expectedReturn));

            const tableRows = activeLeaves.map(l => {
                const rowClass = l.isOverdue ? 'bg-red-100' : 'bg-yellow-100';
                const textColor = l.isOverdue ? 'red' : 'black';
                
                return `
                    <tr class="${rowClass}">
                        <td style="padding: 8px; border: 1px solid #ccc;">${l.studentName} (${l.studentId})</td> 
                        <td style="padding: 8px; border: 1px solid #ccc;">${l.studentClass}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${l.type}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${formatDate(l.departureDate)}</td>
                        <td style="padding: 8px; border: 1px solid #ccc; font-weight: bold; color: ${textColor};">${formatDate(l.expectedReturn)}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${l.reason}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${l.authorizedBy}</td>
                    </tr>
                `;
            }).join('');

            const title = classFilter === 'ALL' ? "Active Student Leave Roster" : `Active Leave Roster for Class: ${classFilter}`;

            const content = `
                <p style="font-size: 1.125rem; font-weight: bold; margin-bottom: 1rem;">
                    Total Students Currently on Leave: ${activeLeaves.length} | 
                    Overdue Returns: ${activeLeaves.filter(l => l.isOverdue).length}
                </p>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead style="background-color: #e5e7eb;">
                        <tr>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Student</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Class</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Leave Type</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Departure Date</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Expected Return</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Reason</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Authorized By</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `;
            showLoading(false);
            preparePrintLayout(title, content);
        }
        
        function generateStudentBalanceReport(classFilter = 'ALL') {
            showLoading();
            let studentsToReport = SMS_DB.students || [];
            if (classFilter !== 'ALL') {
                studentsToReport = studentsToReport.filter(s => s.class === classFilter);
            }

            const studentSummaries = studentsToReport.map(s => getStudentPaymentSummary(s.id))
                .sort((a, b) => b.balance - a.balance); 

            const tableRows = studentSummaries.map(s => {
                let colorClass = 'bg-white';
                if (s.balance > 0.01) colorClass = 'bg-red-100';
                if (s.balance < -0.01) colorClass = 'bg-green-100';
                
                return `
                    <tr class="${colorClass}">
                        <td style="padding: 8px; border: 1px solid #ccc;">${s.studentId}</td> 
                        <td style="padding: 8px; border: 1px solid #ccc;">${s.name}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${s.class}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${formatCurrency(s.totalInvoicedNet)}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${formatCurrency(s.totalPaid)}</td>
                        <td style="padding: 8px; border: 1px solid #ccc; font-weight: bold;">${formatCurrency(s.balance)}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${s.status}</td>
                    </tr>
                `;
            }).join('');

            const totalInvoiced = studentSummaries.reduce((sum, s) => sum + s.totalInvoicedNet, 0);
            const totalPaid = studentSummaries.reduce((sum, s) => sum + s.totalPaid, 0);
            const totalBalance = studentSummaries.reduce((sum, s) => sum + s.balance, 0);

            const title = classFilter === 'ALL' ? "Student Financial Balance Report (Detailed)" : `Financial Balance Report for Class: ${classFilter}`;

            const content = `
                <p style="font-size: 1.125rem; font-weight: bold; margin-bottom: 1rem;">
                    Total Net Invoiced: ${formatCurrency(totalInvoiced)} | 
                    Total Paid: ${formatCurrency(totalPaid)} | 
                    Total Net Outstanding Balance: <span style="color: ${totalBalance > 0 ? 'red' : 'green'}">${formatCurrency(totalBalance)}</span>
                </p>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead style="background-color: #e5e7eb;">
                        <tr>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Adm. No.</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Student Name</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Class</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Net Invoiced</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Total Paid</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Balance Due</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Status</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `;
            showLoading(false);
            preparePrintLayout(title, content);
        }
        
        function generateStudentStatusReport(classFilter = 'ALL') {
            showLoading();
            let studentsToReport = SMS_DB.students || [];
            if (classFilter !== 'ALL') {
                studentsToReport = studentsToReport.filter(s => s.class === classFilter);
            }

            const studentSummaries = studentsToReport.map(s => getStudentPaymentSummary(s.id))
                .sort((a, b) => a.name.localeCompare(b.name));

            const outstanding = studentSummaries.filter(s => s.balance > 0.01);
            const cleared = studentSummaries.filter(s => s.balance <= 0.01);

            const getTableRows = (students, bgColorClass) => {
                return students.map(s => `
                    <tr class="${bgColorClass}">
                        <td style="padding: 8px; border: 1px solid #ccc;">${s.studentId}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${s.name}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${s.class}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${formatCurrency(s.totalInvoicedNet)}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${formatCurrency(s.totalPaid)}</td>
                        <td style="padding: 8px; border: 1px solid #ccc; font-weight: bold; color: ${s.balance > 0 ? 'red' : (s.balance < 0 ? 'green' : 'black')};">${formatCurrency(s.balance)}</td>
                    </tr>
                `).join('');
            };

            const generateSection = (students, title, color, bgColorClass) => {
                 const rows = getTableRows(students, bgColorClass);
                 return `
                    <h4 style="font-size: 1.25rem; font-weight: 600; margin-top: 20px; margin-bottom: 10px; color: ${color};">${title} (${students.length} Students)</h4>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                        <thead style="background-color: #f1f5f9;">
                            <tr>
                                <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Adm. No.</th>
                                <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Name</th>
                                <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Class</th>
                                <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Net Due</th>
                                <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Total Paid</th>
                                <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Balance</th>
                            </tr>
                        </thead>
                        <tbody>${rows || `<tr><td colspan="6" style="padding: 8px; text-align: center; border: 1px solid #ccc;">No students in this category.</td></tr>`}</tbody>
                    </table>
                `;
            };

            const title = classFilter === 'ALL' ? "Student Fee Status Report (Outstanding vs Cleared)" : `Fee Status Report for Class: ${classFilter}`;

            const content = 
                generateSection(outstanding, "I. Students with Outstanding Fees (Owed to School)", '#dc2626', 'bg-red-100') +
                generateSection(cleared, "II. Students with Cleared/Credit Accounts", '#10b981', 'bg-green-100');

            showLoading(false);
            preparePrintLayout(title, content);
        }

        // New Report: Daily Payments
        function showDailyPaymentsExportModal() {
            dailyPaymentsModal.classList.remove('hidden');
            // Set default date to today
            document.getElementById('payments-date-select').value = new Date().toISOString().split('T')[0];
        }

        function handleDailyPaymentsSubmission(event) {
            event.preventDefault();
            const selectedDate = document.getElementById('payments-date-select').value;
            dailyPaymentsModal.classList.add('hidden');
            generateDailyPaymentsReport(selectedDate);
        }

        function generateDailyPaymentsReport(dateFilter) {
            showLoading();
            const paymentsOnDate = SMS_DB.payments.filter(p => p.date === dateFilter).sort((a, b) => a.id.localeCompare(b.id));

            if (paymentsOnDate.length === 0) {
                alert(`No payments recorded on ${formatDate(dateFilter)}.`);
                showLoading(false);
                return;
            }

            let totalAmount = 0;
            const tableRows = paymentsOnDate.map(p => {
                const invoice = SMS_DB.invoices.find(i => i.id === p.invoiceId);
                const student = invoice ? SMS_DB.students.find(s => s.id === invoice.studentId) : null;
                const studentName = student ? `${student.name} (${student.id})` : 'Unknown Student';
                const studentClass = student ? student.class : 'N/A';
                const feeType = invoice ? (SMS_DB.feeStructures.find(fs => fs.id === invoice.structureId)?.name || 'Custom Fee') : 'N/A';
                
                totalAmount += p.amount;

                return `
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ccc;">${studentName}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${studentClass}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${feeType}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${formatCurrency(p.amount)}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${p.method}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${p.invoiceId}</td>
                    </tr>
                `;
            }).join('');

            const content = `
                <p style="font-size: 1.125rem; font-weight: bold; margin-bottom: 1rem;">
                    Total Payments on ${formatDate(dateFilter)}: <span style="color: #10b981;">${formatCurrency(totalAmount)}</span>
                </p>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead style="background-color: #e5e7eb;">
                        <tr>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Student</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Class</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Fee Type</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Amount Paid</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Method</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Invoice ID</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `;
            showLoading(false);
            preparePrintLayout(`Daily Payments Report for ${formatDate(dateFilter)}`, content);
        }

        // New Report: Student Invoice Balances (Detailed)
        function generateStudentInvoiceBalancesDetailed(classFilter = 'ALL', streamFilter = 'ALL') {
            showLoading();
            let studentsToReport = SMS_DB.students || [];

            if (classFilter !== 'ALL') {
                studentsToReport = studentsToReport.filter(s => s.class === classFilter);
            }
            if (streamFilter !== 'ALL') {
                studentsToReport = studentsToReport.filter(s => s.stream === streamFilter);
            }

            studentsToReport.sort((a, b) => a.name.localeCompare(b.name));

            let reportContent = '';
            let overallTotalBalance = 0;

            if (studentsToReport.length === 0) {
                reportContent = `<p style="text-align: center; padding: 20px;">No students found for the selected criteria.</p>`;
            } else {
                studentsToReport.forEach(student => {
                    const studentInvoices = SMS_DB.invoices.filter(inv => inv.studentId === student.id);
                    const studentOverallSummary = getStudentPaymentSummary(student.id);
                    overallTotalBalance += studentOverallSummary.balance;

                    let invoiceRows = '';
                    if (studentInvoices.length === 0) {
                        invoiceRows = `<tr><td colspan="8" style="padding: 8px; border: 1px solid #ccc; text-align: center;">No invoices for this student.</td></tr>`;
                    } else {
                        studentInvoices.sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort invoices by date
                        invoiceRows = studentInvoices.map(inv => {
                            const details = getInvoiceDetails(inv);
                            let balanceColor = 'black';
                            if (details.balance > 0.01) balanceColor = 'red';
                            if (details.balance < -0.01) balanceColor = 'green';

                            return `
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-size: 12px;">${inv.id}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-size: 12px;">${details.structureName}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-size: 12px;">${formatDate(inv.date)}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-size: 12px;">${formatCurrency(details.amountDue)}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-size: 12px;">${formatCurrency(details.totalBursaries)}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-size: 12px;">${formatCurrency(details.totalPayments)}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-size: 12px; font-weight: bold; color: ${balanceColor};">${formatCurrency(details.balance)}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-size: 12px;">${details.status}</td>
                                </tr>
                            `;
                        }).join('');
                    }

                    reportContent += `
                        <div style="margin-bottom: 25px; page-break-inside: avoid;">
                            <h3 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid #ccc;">
                                Student: ${student.name} (${student.id}) | Class: ${student.class} / ${student.stream}
                            </h3>
                            <p style="margin-bottom: 10px; font-weight: bold;">
                                Overall Balance: <span style="color: ${studentOverallSummary.balance > 0.01 ? 'red' : (studentOverallSummary.balance < -0.01 ? 'green' : 'black')};">${formatCurrency(studentOverallSummary.balance)}</span>
                            </p>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                                <thead style="background-color: #f1f5f9;">
                                    <tr>
                                        <th style="padding: 8px; border: 1px solid #ccc; text-align: left; font-size: 12px;">Invoice ID</th>
                                        <th style="padding: 8px; border: 1px solid #ccc; text-align: left; font-size: 12px;">Fee Item</th>
                                        <th style="padding: 8px; border: 1px solid #ccc; text-align: left; font-size: 12px;">Date</th>
                                        <th style="padding: 8px; border: 1px solid #ccc; text-align: left; font-size: 12px;">Amount Due</th>
                                        <th style="padding: 8px; border: 1px solid #ccc; text-align: left; font-size: 12px;">Bursary</th>
                                        <th style="padding: 8px; border: 1px solid #ccc; text-align: left; font-size: 12px;">Paid</th>
                                        <th style="padding: 8px; border: 1px solid #ccc; text-align: left; font-size: 12px;">Balance</th>
                                        <th style="padding: 8px; border: 1px solid #ccc; text-align: left; font-size: 12px;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>${invoiceRows}</tbody>
                            </table>
                        </div>
                    `;
                });
            }
            
            const title = `Student Invoice Balances (Detailed) for ${classFilter === 'ALL' ? 'All Classes' : classFilter} ${streamFilter === 'ALL' ? 'All Streams' : `Stream ${streamFilter}`}`;
            
            const finalContent = `
                <p style="font-size: 1.125rem; font-weight: bold; margin-bottom: 1.5rem; text-align: center;">
                    Overall Net Balance for All Filtered Students: <span style="color: ${overallTotalBalance > 0 ? 'red' : 'green'};">${formatCurrency(overallTotalBalance)}</span>
                </p>
                ${reportContent}
            `;

            showLoading(false);
            preparePrintLayout(title, finalContent);
        }


        function generateOverdueBookReport() {
            showLoading();
            const overdueIssues = (SMS_DB.issues || [])
                .filter(i => !i.returnDate && new Date(i.dueDate + 'T00:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T00:00:00'))
                .map(i => {
                    const student = SMS_DB.students.find(s => s.id === i.studentId);
                    const book = SMS_DB.books.find(b => b.id === i.bookId);
                    
                    const date1 = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00').getTime();
                    const date2 = new Date(i.dueDate + 'T00:00:00').getTime();
                    const daysOverdue = Math.floor((date1 - date2) / (1000 * 3600 * 24));

                    return { ...i, studentName: student?.name || 'N/A', bookTitle: book?.title || 'Unknown Book', fine: calculateFine(i), daysOverdue };
                })
                .sort((a, b) => b.fine - a.fine);

            const tableRows = overdueIssues.map(i => `
                <tr class="bg-red-100">
                    <td style="padding: 8px; border: 1px solid #ccc;">${i.studentName}</td>
                    <td style="padding: 8px; border: 1px solid #ccc;">${i.bookTitle}</td>
                    <td style="padding: 8px; border: 1px solid #ccc;">${formatDate(i.dueDate)}</td>
                    <td style="padding: 8px; border: 1px solid #ccc;">${i.daysOverdue} days</td>
                    <td style="padding: 8px; border: 1px solid #ccc; font-weight: bold;">${formatCurrency(i.fine)}</td>
                </tr>
            `).join('');
            
            const totalFines = overdueIssues.reduce((sum, i) => sum + i.fine, 0);

            const content = `
                <p style="font-size: 1.125rem; font-weight: bold; margin-bottom: 1rem;">Total Potential Fines from Overdue Books: <span style="color: red">${formatCurrency(totalFines)}</span></p>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead style="background-color: #e5e7eb;">
                        <tr>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Student Name</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Book Title</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Due Date</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Days Overdue</th>
                            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Fine Due (Est.)</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows || `<tr><td colspan="5" style="padding: 8px; text-align: center; border: 1px solid #ccc;">No books are currently overdue.</td></tr>`}</tbody>
                </table>
            `;
            showLoading(false);
            preparePrintLayout("Library Overdue Books Report", content);
        }
        
        function launchSMS() { openLogin(); }

        window.onload = async () => {
            document.getElementById('sms-container').classList.add('hidden');
            const ok = await restoreSession();
            if (ok) {
                document.getElementById('website-container').classList.add('hidden');
                document.getElementById('sms-container').classList.remove('hidden');
                loadData();
                navigate('dashboard');
            }
        };
    
