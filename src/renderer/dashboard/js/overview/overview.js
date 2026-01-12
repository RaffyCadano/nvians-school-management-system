// Overview view renderer
function renderOverviewView() {
  const html = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h3 class="m-0">Admin Dashboard</h3>
        <div class="text-muted small" id="welcomeAdmin">Welcome back, Admin</div>
      </div>
      <div class="d-flex gap-2 align-items-center">
        <input id="overviewQuickSearch" class="form-control form-control-sm" placeholder="Quick search (student/teacher/class/subject)" style="min-width:240px; max-width:420px;" />
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="row g-3" id="overviewKpiRow">
      <div class="col-6 col-md-3"><div class="card kpi-card" data-view="student"><div class="card-body text-center"><div class="small text-muted">Total Students</div><div class="h3" id="kpiStudents">0</div></div></div></div>
      <div class="col-6 col-md-3"><div class="card kpi-card" data-view="teacher"><div class="card-body text-center"><div class="small text-muted">Total Teachers</div><div class="h3" id="kpiTeachers">0</div></div></div></div>
      <div class="col-6 col-md-3"><div class="card kpi-card" data-view="classes"><div class="card-body text-center"><div class="small text-muted">Total Classes</div><div class="h3" id="kpiClasses">0</div></div></div></div>
      <div class="col-6 col-md-3"><div class="card kpi-card" data-view="subjects"><div class="card-body text-center"><div class="small text-muted">Total Subjects</div><div class="h3" id="kpiSubjects">0</div></div></div></div>
    </div>

    <div class="row mt-4">
      <div class="col-lg-6">
        <div class="card mb-3">
          <div class="card-header"><strong>Action Needed</strong></div>
          <div class="card-body" id="actionNeededList">
            <!-- populated dynamically -->
          </div>
        </div>

        <div class="card mb-3">
          <div class="card-header"><strong>Quick Shortcuts</strong></div>
          <div class="card-body">
            <div class="row g-2" id="quickShortcuts">
              <div class="col-4"><button class="btn btn-outline-primary w-100" data-view="admin">Admin Accounts</button></div>
              <div class="col-4"><button class="btn btn-outline-primary w-100" data-view="teacher">Teacher Accounts</button></div>
              <div class="col-4"><button class="btn btn-outline-primary w-100" data-view="student">Student Accounts</button></div>
              <div class="col-4"><button class="btn btn-outline-primary w-100" data-view="classes">Classes</button></div>
              <div class="col-4"><button class="btn btn-outline-primary w-100" data-view="subjects">Subjects</button></div>
              <div class="col-4"><button class="btn btn-outline-primary w-100" data-view="enroll-classes">Enroll (Class)</button></div>
              <div class="col-4"><button class="btn btn-outline-primary w-100" data-view="enroll-subjects">Enroll (Subject)</button></div>
              <div class="col-4"><button class="btn btn-outline-primary w-100" data-view="attendance">Attendance</button></div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-6">
        <div class="card mb-3">
          <div class="card-header"><strong>Today / Recent Activity</strong></div>
          <div class="card-body d-flex gap-3">
            <div class="flex-fill">
              <h6 class="small text-muted">Today's Attendance Snapshot</h6>
              <table class="table table-sm">
                <thead><tr><th>Class/Subject</th><th>Teacher</th><th>Status</th><th></th></tr></thead>
                <tbody id="todayAttendanceBody"></tbody>
              </table>
            </div>
            <div class="flex-fill w-25">
              <h6 class="small text-muted">Recent Changes</h6>
              <ul class="list-unstyled small" id="recentChangesList"></ul>
              <a href="#" id="viewAuditLogs" class="btn btn-primary btn-sm">View Audit Logs</a>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><strong>System Data Summary</strong></div>
          <div class="card-body" id="systemSummary">
            <!-- simple counters -->
            <div>Total assignments this week: <span id="summaryAssignments">0</span></div>
            <div>Attendance rate (7d): <span id="summaryAttendance">0%</span></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const mainEl = document.getElementById("mainContent");
  if (!mainEl) return; // nothing to do if main container missing
  mainEl.innerHTML = html;

  function getCounts() {
    const students = (window._students || []).length;
    const teachers = (window._teachers || []).length;
    const classes = (window._classes || []).length;
    const subjects = (window._subjects || []).length || 0;
    return { students, teachers, classes, subjects };
  }

  const counts = getCounts();
  document.getElementById("kpiStudents").textContent = counts.students;
  document.getElementById("kpiTeachers").textContent = counts.teachers;
  document.getElementById("kpiClasses").textContent = counts.classes;
  document.getElementById("kpiSubjects").textContent = counts.subjects;

  // Action Needed: compute and render using a small helper so checks are consistent
  function computeActionNeeded() {
    const actions = [];
    const isTruthy = (v) =>
      v !== null &&
      v !== undefined &&
      !(typeof v === "string" && v.trim() === "");
    const hasAdvisor = (c) => {
      if (!c) return false;
      // common explicit fields
      const explicit = [
        "advisor_teacher_id",
        "advisorName",
        "advisorId",
        "advisor",
        "advisor_teacher",
        "advisorTeacherId",
        "advisor_teacher_uid",
        "advisor_uid",
        "advisor_id",
        "advisorTeacher",
        "teacher",
        "teacherId",
        "advisor_id",
      ];
      for (const k of explicit) {
        if (k in c && isTruthy(c[k])) return true;
      }
      // check nested shapes and any property name containing advisor or advisor/teacher cues
      for (const k of Object.keys(c || {})) {
        const lk = String(k).toLowerCase();
        if (
          lk.includes("advisor") ||
          lk.includes("advisor") ||
          lk.includes("teacher")
        ) {
          const v = c[k];
          if (isTruthy(v)) return true;
          if (typeof v === "object" && v !== null) {
            if (
              isTruthy(v.id) ||
              isTruthy(v.uid) ||
              isTruthy(v.name) ||
              isTruthy(v.displayName)
            )
              return true;
          }
        }
      }
      return false;
    };
    (window._classes || []).forEach((c) => {
      if (!hasAdvisor(c))
        actions.push({
          key: "assignAdvisor",
          label: `Class ${
            c.name || c.className || c.section || c.id
          } has no advisor`,
          action: "assign-advisor",
          id: c.id,
        });
    });
    (window._classSubjects || []).forEach((cs) => {
      const hasTeacher = Boolean(
        cs.teacherId || cs.teacher || cs.teacherName || cs.teacher_id
      );
      if (!hasTeacher)
        actions.push({
          key: "assignTeacher",
          label: `Offering ${cs.subjectName || cs.subjectCode} for ${
            cs.className || cs.classId
          } has no teacher`,
          action: "assign-teacher",
          id: cs.id,
        });
    });
    (window._students || []).forEach((s) => {
      if (!s.className && !s.classId)
        actions.push({
          key: "enrollStudent",
          label: `Student <strong>${s.firstName || s.name || ""} ${
            s.lastName || ""
          }</strong> not enrolled`,
          action: "enroll-student",
          id: s.id,
        });
    });
    const inactiveAccounts =
      (window._teachers || []).filter(
        (t) => String(t.status || "").toLowerCase() === "disabled"
      ).length +
      (window._students || []).filter(
        (s) => String(s.status || "").toLowerCase() === "disabled"
      ).length;
    if (inactiveAccounts)
      actions.push({
        key: "reviewAccounts",
        label: `${inactiveAccounts} inactive/disabled accounts`,
        action: "review-accounts",
      });
    // Consider system configured if any active school-year or term metadata exists.
    // Check multiple possible flags to be resilient to load ordering: boolean flag, active school-year id/label, or active term id.
    const hasActiveSchoolYear = !!(
      window._schoolYearActive ||
      window._activeSchoolYearId ||
      window._activeSchoolYearLabel
    );
    const hasActiveTerm = !!window._activeTermId;
    if (!(hasActiveSchoolYear || hasActiveTerm))
      actions.push({
        key: "setupYear",
        label: "No active school year/term configured",
        action: "setup-year",
      });

    const actionContainer = document.getElementById("actionNeededList");
    if (!actionContainer) return;
    if (actions.length === 0)
      actionContainer.innerHTML =
        '<div class="text-success">No immediate actions needed.</div>';
    else
      actionContainer.innerHTML = actions
        .slice(0, 8)
        .map(
          (a) =>
            `<div class="d-flex justify-content-between align-items-center mb-2"><div>${
              a.label
            }</div><div><button class="btn btn-sm btn-primary action-needed-btn" data-action="${
              a.action
            }" data-id="${a.id || ""}">Take action</button></div></div>`
        )
        .join("");
  }

  // show placeholder until we fetch fresh data from RTDB / IPC
  const actionContainerPlaceholder =
    document.getElementById("actionNeededList");
  if (actionContainerPlaceholder)
    actionContainerPlaceholder.innerHTML =
      '<div class="text-muted small">Loading action items...</div>';

  // Attach delegated handler for action-needed buttons (works for dynamic content)
  function safeLoadView(view) {
    try {
      if (typeof loadView === "function") loadView(view);
      else if (window.loadView) window.loadView(view);
    } catch (e) {}
  }
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest && ev.target.closest(".action-needed-btn");
    if (!btn) return;
    const a = btn.dataset.action;
    if (!a) return;
    if (a === "assign-advisor") safeLoadView("classes");
    else if (a === "assign-teacher") safeLoadView("subjects");
    else if (a === "enroll-student") safeLoadView("enroll-classes");
    else if (a === "review-accounts") safeLoadView("account-management");
    else if (a === "setup-year") safeLoadView("system-settings");
  });

  // Quick shortcuts and KPI card clicks
  document
    .querySelectorAll("#quickShortcuts button, .kpi-card")
    .forEach((el) => {
      el.addEventListener("click", (ev) => {
        const view = el.dataset.view;
        const action = el.dataset.action;
        if (view) {
          try {
            if (typeof loadView === "function") loadView(view);
            else if (window.loadView) window.loadView(view);
          } catch (e) {}
        }
        if (action) {
          /* placeholder for actions like enroll */
        }
      });
    });

  // populate attendance and recent activity with simple samples
  const todayBody = document.getElementById("todayAttendanceBody");
  todayBody.innerHTML = "";
  (window._classSubjects || []).slice(0, 5).forEach((a, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td style="max-width:220px; vertical-align:middle;"><div class="text-truncate" style="max-width:220px;">${
      a.className || a.classId
    } - ${a.subjectName || a.subjectCode}</div></td><td>${
      a.teacherName || "(none)"
    }</td><td>${
      a.taken ? "Taken" : "Not Taken"
    }</td>`;
    todayBody.appendChild(tr);
  });

  const recent = document.getElementById("recentChangesList");
  recent.innerHTML = "";
  (window._recentActivity || ["No recent activity"])
    .slice(0, 10)
    .forEach((r) => {
      const li = document.createElement("li");
      li.textContent = r;
      recent.appendChild(li);
    });

  // Open Audit Logs view (prefer direct render, fallback to loading system-settings then render)
  try {
    const viewAuditBtn = document.getElementById("viewAuditLogs");
    if (viewAuditBtn) {
      viewAuditBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        try {
          if (typeof window.renderAuditLogsView === "function") {
            window.renderAuditLogsView();
            return;
          }
          if (typeof loadView === "function") {
            loadView("system-settings");
            setTimeout(() => {
              try {
                if (typeof window.renderAuditLogsView === "function")
                  window.renderAuditLogsView();
              } catch (e) {}
            }, 300);
            return;
          }
          if (window.loadView) {
            window.loadView("system-settings");
            setTimeout(() => {
              try {
                if (typeof window.renderAuditLogsView === "function")
                  window.renderAuditLogsView();
              } catch (e) {}
            }, 300);
            return;
          }
        } catch (e) {
          console.warn("navigate to audit logs failed", e);
        }
      });
    }
  } catch (e) {
    console.warn("attach viewAuditLogs handler failed", e);
  }

  // system summary
  document.getElementById("summaryAssignments").textContent = (
    window._classSubjects || []
  ).length;
  document.getElementById("summaryAttendance").textContent = "–";

  // action-needed button handlers
  document.querySelectorAll(".action-needed-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const a = b.dataset.action;
      if (a === "assign-advisor") loadView("classes");
      if (a === "assign-teacher") loadView("subjects");
      if (a === "enroll-student") loadView("student-management");
      if (a === "review-accounts") loadView("account-management");
      if (a === "setup-year")
        alert("Open system settings to configure school year");
    })
  );

  // Load live data (secure-first): students, teachers via IPC; classes/subjects via RTDB fallback
  async function loadOverviewData() {
    try {
      // helper to convert map to array
      const mapToArray = (obj, mapFn) => {
        if (!obj) return [];
        return Object.keys(obj)
          .map((k) => Object.assign({ id: String(k) }, obj[k] || {}))
          .map(mapFn || ((x) => x));
      };

      // Attempt secure fetches via preload API
      let studentsArr = window._students || [];
      let teachersArr = window._teachers || [];
      let classesArr = window._classes || [];
      let subjectsArr = window._subjects || [];
      let classSubjectsArr = window._classSubjects || [];
      let recent = window._recentActivity || [];
      let schoolYearActive = window._schoolYearActive || false;

      try {
        if (window.api && window.api.fetchStudents) {
          const res = await window.api.fetchStudents();
          if (res && res.ok && res.data)
            studentsArr = mapToArray(res.data, (v) => ({
              id: v.id || v.uid || v.id,
              firstName: v.firstName || v.name || "",
              lastName: v.lastName || "",
              studentNo: v.studentNo || v.number || "",
              email: v.email || "",
              className: v.className || "",
              status: v.status || "Active",
              createdAt: v.createdAt,
            }));
        }
      } catch (e) {
        console.warn("fetchStudents IPC failed", e);
      }

      try {
        if (window.api && window.api.fetchTeachers) {
          const res = await window.api.fetchTeachers();
          if (res && res.ok && res.data)
            teachersArr = mapToArray(res.data, (v) => ({
              id: v.id || v.uid || v.id,
              firstName: v.firstName || "",
              lastName: v.lastName || "",
              email: v.email || "",
              employeeId: v.employeeId || "",
              department: v.department || "",
              status: v.status || "Active",
              createdAt: v.createdAt,
            }));
        }
      } catch (e) {
        console.warn("fetchTeachers IPC failed", e);
      }

      try {
        if (window.api && window.api.fetchAdmins) {
          const res = await window.api.fetchAdmins();
          if (res && res.ok && res.data) {
            // detect active school year flag if stored
            if (res.data._meta && res.data._meta.schoolYearActive)
              schoolYearActive = true;
          }
        }
      } catch (e) {
        /* ignore */
      }

      // For classes/subjects/classSubjects try client RTDB
      const loadScript = (src) =>
        new Promise((resolve, reject) => {
          if (document.querySelector('script[src="' + src + '"]'))
            return resolve();
          const s = document.createElement("script");
          s.src = src;
          s.async = false;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load " + src));
          document.head.appendChild(s);
        });

      try {
        if (!window.firebase) {
          await loadScript(
            "https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js"
          );
          await loadScript(
            "https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js"
          );
        }
        if (
          window.firebase &&
          (!window.firebase.apps || window.firebase.apps.length === 0) &&
          window.firebaseConfig
        ) {
          window.firebase.initializeApp(window.firebaseConfig);
        }
        if (window.firebase && window.firebase.database) {
          try {
            const db = window.firebase.database();
            const classesSnap = await db.ref("/classes").once("value");
            const classesVal = classesSnap.val() || {};
            classesArr = mapToArray(classesVal, (v) => ({
              id: v.id || v.classId || "",
              name: v.name || v.className || v.section || "",
              schoolYear: v.schoolYear || v.school_year || "",
              gradeLevel: v.gradeLevel || v.grade || "",
              section: v.section || "",
              // preserve advisor fields so overview can detect assigned advisors
              advisorName:
                v.advisorName ||
                v.advisor ||
                v.teacherName ||
                v.advisor_name ||
                v.advisor_id ||
                "",
              advisor_teacher_id:
                v.advisor_teacher_id ||
                v.advisorId ||
                v.advisor_id ||
                v.teacherId ||
                v.teacher_id ||
                "",
              studentsCount:
                v.studentsCount != null
                  ? v.studentsCount
                  : v.students
                  ? Array.isArray(v.students)
                    ? v.students.length
                    : Object.keys(v.students).length
                  : v.student_ids
                  ? Object.keys(v.student_ids).length
                  : 0,
            }));

            const subjectsSnap = await db.ref("/subjects").once("value");
            const subjectsVal = subjectsSnap.val() || {};
            subjectsArr = mapToArray(subjectsVal, (v) => ({
              id: v.id || "",
              subjectName: v.name || v.subjectName || "",
              subjectCode: v.code || v.subjectCode || "",
            }));

            // class-subject offerings
            const csSnap = await db.ref("/class_subjects").once("value");
            const csVal = csSnap.val() || {};
            classSubjectsArr = mapToArray(csVal, (v) => ({
              id: v.id || "",
              className: v.className || v.classId || "",
              subjectName: v.subjectName || v.subjectCode || "",
              teacherName: v.teacherName || "",
              taken: !!v.taken,
            }));

            // recent activity / admin-audit
            const auditSnap = await db
              .ref("/admin-audit")
              .orderByChild("ts")
              .limitToLast(20)
              .once("value");
            const auditVal = auditSnap.val() || {};
            recent = Object.keys(auditVal).map((k) =>
              auditVal[k] && auditVal[k].action
                ? `${auditVal[k].action} — ${
                    auditVal[k].performedBy || "system"
                  }`
                : JSON.stringify(auditVal[k])
            );
          } catch (e) {
            console.warn("RTDB overview reads failed", e);
          }
        }
      } catch (e) {
        console.warn("load firebase for overview failed", e);
      }

      // Persist to globals for other modules
      window._students = studentsArr || [];
      window._teachers = teachersArr || [];
      window._classes = classesArr || [];
      window._subjects = subjectsArr || [];
      window._classSubjects = classSubjectsArr || [];
      window._recentActivity = recent || [];
      window._schoolYearActive = !!schoolYearActive;

      // Update KPIs (guard elements)
      const elKpiStudents = document.getElementById("kpiStudents");
      if (elKpiStudents)
        elKpiStudents.textContent = (window._students || []).length;
      const elKpiTeachers = document.getElementById("kpiTeachers");
      if (elKpiTeachers)
        elKpiTeachers.textContent = (window._teachers || []).length;
      const elKpiClasses = document.getElementById("kpiClasses");
      if (elKpiClasses)
        elKpiClasses.textContent = (window._classes || []).length;
      const elKpiSubjects = document.getElementById("kpiSubjects");
      if (elKpiSubjects)
        elKpiSubjects.textContent = (window._subjects || []).length;

      // Rebuild action-needed using shared helper
      try {
        computeActionNeeded();
      } catch (e) {
        console.warn("computeActionNeeded failed", e);
      }

      // Rebuild attendance and recent
      const todayBody = document.getElementById("todayAttendanceBody");
      if (todayBody) {
        todayBody.innerHTML = "";
        (window._classSubjects || []).slice(0, 5).forEach((a, i) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td style="max-width:220px; vertical-align:middle;"><div class="text-truncate" style="max-width:220px;">${
            a.className || a.classId
          } - ${a.subjectName || a.subjectCode}</div></td><td>${
            a.teacherName || "(none)"
          }</td><td>${a.taken ? "Taken" : "Not Taken"}</td>`;
          todayBody.appendChild(tr);
        });
      }
      const recentEl = document.getElementById("recentChangesList");
      if (recentEl) {
        recentEl.innerHTML = "";
        (window._recentActivity || ["No recent activity"])
          .slice(0, 10)
          .forEach((r) => {
            const li = document.createElement("li");
            li.textContent = r;
            recentEl.appendChild(li);
          });
      }

      // system summary
      const summaryAssignmentsEl =
        document.getElementById("summaryAssignments");
      if (summaryAssignmentsEl)
        summaryAssignmentsEl.textContent = (window._classSubjects || []).length;
      // compute attendance rate if we have taken flags
      try {
        const arr = window._classSubjects || [];
        if (arr.length) {
          const taken = arr.filter((x) => x.taken).length;
          const rate = Math.round((taken / arr.length) * 100);
          const summaryAttendanceEl =
            document.getElementById("summaryAttendance");
          if (summaryAttendanceEl) summaryAttendanceEl.textContent = rate + "%";
        } else {
          const summaryAttendanceEl =
            document.getElementById("summaryAttendance");
          if (summaryAttendanceEl) summaryAttendanceEl.textContent = "–";
        }
      } catch (e) {
        const summaryAttendanceEl =
          document.getElementById("summaryAttendance");
        if (summaryAttendanceEl) summaryAttendanceEl.textContent = "–";
      }
    } catch (err) {
      console.warn("loadOverviewData failed", err);
    }
  }

  // trigger initial load (use async IIFE to avoid relying on Promise.catch availability)
  (async () => {
    try {
      await loadOverviewData();
    } catch (e) {
      /* ignore */
    }
  })();

  // set welcome text with admin first name if available and update reactively on auth changes
  (function setupWelcomeReactive() {
    // If the main process forwarded a minimal signed user via IPC, register
    // a callback to receive it. This uses the preload bridge `api.onDashboardAuthUser`.
    try {
      if (window.api && typeof window.api.onDashboardAuthUser === "function") {
        try {
          window.api.onDashboardAuthUser((payload) => {
            try {
              const user = payload && payload.user ? payload.user : payload;
              updateWelcomeFromUser(user);

              // If a custom token was provided, try to sign in the client SDK
              const token = payload && payload.customToken;
              if (token) {
                const trySign = () => {
                  try {
                    if (
                      window.firebase &&
                      Array.isArray(window.firebase.apps) &&
                      window.firebase.apps.length > 0 &&
                      window.firebase.auth
                    ) {
                      window.firebase
                        .auth()
                        .signInWithCustomToken(token)
                        .catch(() => {});
                      return true;
                    }
                  } catch (e) {}
                  return false;
                };
                // If firebase not ready, poll briefly
                if (!trySign()) {
                  let attempts = 0;
                  const p = setInterval(() => {
                    attempts++;
                    if (trySign() || attempts > 20) clearInterval(p);
                  }, 200);
                }
              }
            } catch (e) {
              console.warn("dashboard onDashboardAuthUser handler failed", e);
            }
          });
        } catch (e) {
          console.warn("failed to attach onDashboardAuthUser", e);
        }
      }
    } catch (e) {
      console.warn("setupWelcomeReactive attach check failed", e);
    }

    function updateWelcomeFromUser(user) {
      try {
        const el = document.getElementById("welcomeAdmin");
        if (!el) return;
        let name = null;
        if (user) name = user.displayName || user.email || "";
        if (!name && window._currentUser)
          name = window._currentUser.displayName || window._currentUser.email;
        if (!name) {
          el.textContent = "Welcome back, Admin";
          return;
        }
        const first = String(name).split(/\s+/)[0] || name;
        el.textContent = `Welcome back, Admin ${first}`;
      } catch (e) {
        console.warn("updateWelcomeFromUser failed", e);
      }
    }

    // Try to attach to Firebase auth state listener if available
    try {
      if (window.firebase && window.firebase.auth) {
        try {
          // Only call firebase.auth() if a Firebase app has been initialized.
          if (
            Array.isArray(window.firebase.apps) &&
            window.firebase.apps.length > 0
          ) {
            window.firebase
              .auth()
              .onAuthStateChanged((u) => updateWelcomeFromUser(u));
            // Set immediately from currentUser if present
            updateWelcomeFromUser(window.firebase.auth().currentUser);
            return;
          }
        } catch (e) {
          console.warn("failed to attach onAuthStateChanged", e);
        }
      }
    } catch (e) {
      console.warn("setupWelcomeReactive firebase check failed", e);
    }

    // As a fallback, poll for a short period until firebase is available and initialized
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (
        window.firebase &&
        Array.isArray(window.firebase.apps) &&
        window.firebase.apps.length > 0 &&
        window.firebase.auth
      ) {
        try {
          window.firebase
            .auth()
            .onAuthStateChanged((u) => updateWelcomeFromUser(u));
          updateWelcomeFromUser(window.firebase.auth().currentUser);
        } catch (e) {
          console.warn("poll attach failed", e);
        }
        clearInterval(poll);
      } else if (attempts > 20) {
        // stop after ~2s
        clearInterval(poll);
      }
    }, 100);
  })();

  // Create audit logs modal lazily
  // (Audit Logs view is provided by `system-settings/audit-logs.js`; we navigate to it instead of using a modal)
}
