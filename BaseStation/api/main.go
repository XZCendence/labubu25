package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/gob"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
)

// ----- Types -----

type Analysis struct {
	IsFocused   bool    `json:"is_focused"`
	FocusLevel  float64 `json:"focus_level"`
	IsAway      bool    `json:"is_away"`
	TextSummary string  `json:"text_summary"`
}

type FocusPoint struct {
	Timestamp  string  `json:"timestamp"`
	Decibels   float64 `json:"decibels"`
	FocusLevel float64 `json:"focus_level"`
	IsFocused  bool    `json:"is_focused"`
	IsAway     bool    `json:"is_away"`
}

type StudyStats struct {
	Status          string       `json:"status"`
	Timestamp       string       `json:"timestamp"`
	SessionActive   bool         `json:"session_active"`
	SessionStarted  string       `json:"session_started,omitempty"`
	DurationSeconds int64        `json:"duration_seconds"`
	SamplesCount    int          `json:"samples_count"`
	LastImageURL    string       `json:"last_image_url"`
	LastAnalysis    Analysis     `json:"last_analysis"`
	FocusHistory    []FocusPoint `json:"focus_history"`
}

// PersistedState represents the on-disk snapshot of the in-memory state
type PersistedState struct {
	SessionActive    bool
	SessionStart     time.Time
	LastImageFile    string
	LastAnalysis     Analysis
	SamplesCount     int
	FocusHistory     []FocusPoint
	CurrentSessionID string
}

// Session represents a completed study session
type Session struct {
	ID           string       `json:"status"`
	Start        time.Time    `json:"timestamp"`
	End          time.Time    `json:"end"`
	SamplesCount int          `json:"samples_count"`
	FocusHistory []FocusPoint `json:"focus_history"`
	LastAnalysis Analysis     `json:"last_analysis"`
}

// ----- Global state (simple in-memory for hackathon) -----

var (
	mu               sync.Mutex
	sessionActive    bool
	sessionStart     time.Time
	lastImageFile    string
	lastAnalysis     Analysis
	samplesCount     int
	focusHistory     []FocusPoint
	tickerStopChan   chan struct{}
	repoRoot         string
	currentSessionID string
	sessions         []Session
)

// ----- Path constants (relative to repo root) -----
const (
	wiliEyeScriptRel   = "wili/wileye.py"
	wiliAudioScriptRel = "wili/audio.py"
	// Store captured images under BaseStation/data/images (repo-root relative)
	dataImagesRel  = "BaseStation/data/images"
	staticDirRel   = "BaseStation/api/static"
	sessionsDirRel = "BaseStation/data/sessions"
	stateFileName  = "state.gob"
)

// ----- Helpers -----

func dataDir() string {
	// Place images under <repoRoot>/BaseStation/api/data/images
	if repoRoot != "" {
		return filepath.Join(repoRoot, dataImagesRel)
	}
	// Fallback: relative (works when CWD is repo root)
	return filepath.Join(dataImagesRel)
}

func ensureDirs() error {
	if err := os.MkdirAll(dataDir(), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(sessionsDir(), 0o755); err != nil {
		return err
	}
	return nil
}

func wiliEyePath() string {
	// Path to the wileye script from repo root execution
	if repoRoot != "" {
		return filepath.Join(repoRoot, wiliEyeScriptRel)
	}
	return filepath.Join(wiliEyeScriptRel)
}

func wiliAudioPath() string {
	// Path to the wileye script from repo root execution
	if repoRoot != "" {
		return filepath.Join(repoRoot, wiliAudioScriptRel)
	}
	return filepath.Join(wiliAudioScriptRel)
}

// sessionsDir returns the absolute path to the sessions directory
func sessionsDir() string {
	if repoRoot != "" {
		return filepath.Join(repoRoot, sessionsDirRel)
	}
	return sessionsDirRel
}

func statePath() string { return filepath.Join(sessionsDir(), stateFileName) }

func saveState() error {
	st := PersistedState{}
	mu.Lock()
	st.SessionActive = sessionActive
	st.SessionStart = sessionStart
	st.LastImageFile = lastImageFile
	st.LastAnalysis = lastAnalysis
	st.SamplesCount = samplesCount
	st.FocusHistory = append([]FocusPoint(nil), focusHistory...)
	st.CurrentSessionID = currentSessionID
	mu.Unlock()

	if err := os.MkdirAll(sessionsDir(), 0o755); err != nil {
		return err
	}
	f, err := os.Create(statePath())
	if err != nil {
		return err
	}
	defer f.Close()
	enc := gob.NewEncoder(f)
	return enc.Encode(&st)
}

func loadState() error {
	f, err := os.Open(statePath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer f.Close()
	var st PersistedState
	dec := gob.NewDecoder(f)
	if err := dec.Decode(&st); err != nil {
		return err
	}
	mu.Lock()
	sessionActive = st.SessionActive
	sessionStart = st.SessionStart
	lastImageFile = st.LastImageFile
	lastAnalysis = st.LastAnalysis
	samplesCount = st.SamplesCount
	focusHistory = append([]FocusPoint(nil), st.FocusHistory...)
	currentSessionID = st.CurrentSessionID
	mu.Unlock()
	return nil
}

func saveCompletedSession(s Session) error {
	if err := os.MkdirAll(sessionsDir(), 0o755); err != nil {
		return err
	}
	fname := filepath.Join(sessionsDir(), fmt.Sprintf("session-%s.gob", s.ID))
	f, err := os.Create(fname)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := gob.NewEncoder(f)
	return enc.Encode(&s)
}

func loadAllSessions() error {
	dir := sessionsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var loaded []Session
	for _, ent := range entries {
		name := ent.Name()
		if name == stateFileName || !strings.HasSuffix(name, ".gob") || !strings.HasPrefix(name, "session-") {
			continue
		}
		f, err := os.Open(filepath.Join(dir, name))
		if err != nil {
			continue
		}
		var s Session
		dec := gob.NewDecoder(f)
		if err := dec.Decode(&s); err == nil {
			loaded = append(loaded, s)
		}
		f.Close()
	}
	mu.Lock()
	sessions = loaded
	mu.Unlock()
	return nil
}

func listSessionStartTimes() []time.Time {
	startTimes := make([]time.Time, 0, len(sessions))
	for _, s := range sessions {
		startTimes = append(startTimes, s.Start)
	}
	return startTimes
}

func runCaptureOnce() (string, string, error) {
	i, e := runCaptureImageOnce()
	if e != nil {
		return "", "", e
	}
	a, e2 := runCaptureAudioOnce()
	if e2 != nil {
		return i, filepath.Join(dataDir(), "audio.txt"), nil
		// return "", "", e2
	}
	return i, a, nil
}

func runCaptureImageOnce() (string, error) {
	if err := ensureDirs(); err != nil {
		return "", err
	}
	// Save with timestamp and also update a symlink-like latest name for the SPA
	ts := time.Now().Format("20060102-150405")
	out := filepath.Join(dataDir(), fmt.Sprintf("capture-%s.jpg", ts))

	// Start python: python3 wili/wileye.py --dest <out> with 30s watchdog
	// We stream logs and watch for a completion line ("Image saved to:") then terminate python.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "python3", wiliEyePath(), "--dest", out)
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start python: %w", err)
	}

	done := make(chan error, 1)
	success := make(chan struct{}, 1)
	go func() { done <- cmd.Wait() }()

	successRe := regexp.MustCompile(`^Image saved to:`)
	errorDoneRe := regexp.MustCompile(`Error: Failed to read response frame in 6\.0 seconds`)
	// helper to read a pipe and mirror lines to stdout
	readPipe := func(r io.Reader) {
		sc := bufio.NewScanner(r)
		for sc.Scan() {
			line := sc.Text()
			fmt.Println(line)
			if successRe.MatchString(line) || errorDoneRe.MatchString(line) {
				select {
				case success <- struct{}{}:
				default:
				}
			}
		}
	}
	go readPipe(stdout)
	go readPipe(stderr)

	var gotSuccess bool
	select {
	case <-success:
		gotSuccess = true
		// Ask python to exit; fall back to Kill if needed
		_ = cmd.Process.Signal(syscall.SIGTERM)
		select {
		case <-time.After(2 * time.Second):
			_ = cmd.Process.Kill()
			<-done
		case <-done:
		case <-ctx.Done():
			_ = cmd.Process.Kill()
			<-done
		}
	case err := <-done:
		if err != nil {
			return "", fmt.Errorf("python exited: %v", err)
		}
	case <-ctx.Done():
		_ = cmd.Process.Kill()
		return "", fmt.Errorf("python capture timed out after 30s")
	}
	if !gotSuccess {
		return "", fmt.Errorf("capture did not report completion")
	}
	if fi, err := os.Stat(out); err != nil || fi.Size() == 0 {
		return "", fmt.Errorf("capture file missing or empty")
	}

	// Also copy to a predictable latest.jpg for easy serving
	latest := filepath.Join(dataDir(), "latest.jpg")
	// Best-effort copy
	if b, err := os.ReadFile(out); err == nil {
		_ = os.WriteFile(latest, b, 0o644)
	}
	return out, nil
}

func runCaptureAudioOnce() (string, error) {
	if err := ensureDirs(); err != nil {
		return "", err
	}
	// Start python: python3 wili/audio.py --dest <out> with 30s watchdog
	// We stream logs and watch for a completion line ("Image saved to:") then terminate python.
	out := filepath.Join(dataDir(), "audio.txt")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "python3", wiliAudioPath(), "--dest", out)
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start python: %w", err)
	}

	done := make(chan error, 1)
	success := make(chan struct{}, 1)
	go func() { done <- cmd.Wait() }()

	successRe := regexp.MustCompile(`^Audio saved to:`)
	errorDoneRe := regexp.MustCompile(`Error: Failed to read response frame in 6\.0 seconds`)
	// helper to read a pipe and mirror lines to stdout
	readPipe := func(r io.Reader) {
		sc := bufio.NewScanner(r)
		for sc.Scan() {
			line := sc.Text()
			fmt.Println(line)
			if successRe.MatchString(line) || errorDoneRe.MatchString(line) {
				select {
				case success <- struct{}{}:
				default:
				}
			}
		}
	}
	go readPipe(stdout)
	go readPipe(stderr)

	var gotSuccess bool
	select {
	case <-success:
		gotSuccess = true
		// Ask python to exit; fall back to Kill if needed
		_ = cmd.Process.Signal(syscall.SIGTERM)
		select {
		case <-time.After(2 * time.Second):
			_ = cmd.Process.Kill()
			<-done
		case <-done:
		case <-ctx.Done():
			_ = cmd.Process.Kill()
			<-done
		}
	case err := <-done:
		if err != nil {
			return "", fmt.Errorf("python exited: %v", err)
		}
	case <-ctx.Done():
		_ = cmd.Process.Kill()
		return "", fmt.Errorf("python audio capture timed out after 30s")
	}
	if !gotSuccess {
		return "", fmt.Errorf("audio capture did not report completion")
	}
	if fi, err := os.Stat(out); err != nil || fi.Size() == 0 {
		return "", fmt.Errorf("audio capture file missing or empty")
	}

	return out, nil
}

// readAudio reads a single float64 value from the given file path.
func readAudio(path string) (float64, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}

	str := strings.TrimSpace(string(data))
	val, err := strconv.ParseFloat(str, 64)
	if err != nil {
		return 0, fmt.Errorf("failed to parse float: %w", err)
	}

	return val, nil
}

func analyzeImage(path string) (Analysis, error) {
	// Calls Gemini GenerateContent REST API with inline image bytes and JSON response config
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		key = os.Getenv("GOOGLE_API_KEY")
	}
	if key == "" {
		return Analysis{}, fmt.Errorf("missing API key: set GEMINI_API_KEY or GOOGLE_API_KEY")
	}

	imgBytes, err := os.ReadFile(path)
	if err != nil {
		return Analysis{}, err
	}
	b64 := base64.StdEncoding.EncodeToString(imgBytes)

	// Prompt instructing strict JSON schema
	prompt := strings.Join([]string{
		"You are an assistant that evaluates study focus from a webcam-like image. Your POV is from the side of the person's desk/workspace. If they are looking straight ahead or down a little bit, they are likely focused.",
		"If they have a phone in front of them, they are likely not focused, Ipad or tablet however may be part of homework.",
		"Return ONLY strict JSON matching this schema with sensible values:",
		"{\"is_focused\": boolean, \"focus_level\": number, \"is_away\": boolean, \"text_summary\": string}",
		"- is_focused: true if person appears engaged with screen/books.",
		"- focus_level: 0.0..1.0 confidence of focus, make sure to use the full range of focus values.",
		"- is_away: true if no person or clearly not at desk, ignore far away persons in the background.",
		"- text_summary: one short sentence.",
	}, "\n")

	reqBody := map[string]any{
		"contents": []any{
			map[string]any{
				"role": "user",
				"parts": []any{
					map[string]any{
						"inline_data": map[string]any{
							"mime_type": "image/jpeg",
							"data":      b64,
						},
					},
					map[string]any{"text": prompt},
				},
			},
		},
		"generation_config": map[string]any{
			"response_mime_type": "application/json",
		},
	}

	bodyBytes, _ := json.Marshal(reqBody)
	url := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + key
	httpClient := &http.Client{Timeout: 30 * time.Second}
	resp, err := httpClient.Post(url, "application/json", strings.NewReader(string(bodyBytes)))
	if err != nil {
		return Analysis{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return Analysis{}, fmt.Errorf("gemini error: %s", string(b))
	}
	var gen struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&gen); err != nil {
		return Analysis{}, err
	}
	if len(gen.Candidates) == 0 || len(gen.Candidates[0].Content.Parts) == 0 {
		return Analysis{}, fmt.Errorf("no content from model")
	}
	text := gen.Candidates[0].Content.Parts[0].Text
	fmt.Println("Gemini raw response:")
	fmt.Println(text)

	var a Analysis
	if err := json.Unmarshal([]byte(text), &a); err != nil {
		// Try to trim code fences if present
		cleaned := strings.TrimSpace(text)
		cleaned = strings.TrimPrefix(cleaned, "```json")
		cleaned = strings.TrimPrefix(cleaned, "```")
		cleaned = strings.TrimSuffix(cleaned, "```")
		if err2 := json.Unmarshal([]byte(strings.TrimSpace(cleaned)), &a); err2 != nil {
			return Analysis{}, fmt.Errorf("unable to parse model JSON: %v; raw: %s", err2, text)
		}
	}
	return a, nil
}

func prevSnapshot(datetime string) Session {
	t, err := time.Parse(time.RFC3339, datetime)
	if err != nil {
		return Session{}
	}

	for _, s := range sessions {
		if s.Start.Equal(t) {
			return s
		}
	}

	return Session{}
}

func snapshot() StudyStats {
	mu.Lock()
	defer mu.Unlock()
	var started string
	var dur int64
	if !sessionStart.IsZero() {
		started = sessionStart.Format(time.RFC3339)
		if sessionActive {
			dur = int64(time.Since(sessionStart).Seconds())
		} else {
			dur = 0
		}
	}
	// Build public URL path for latest image
	latestURL := ""
	if _, err := os.Stat(filepath.Join(dataDir(), "latest.jpg")); err == nil {
		latestURL = "/images/latest.jpg"
	}
	return StudyStats{
		Status:          map[bool]string{true: "studying", false: "idle"}[sessionActive],
		Timestamp:       time.Now().Format(time.RFC3339),
		SessionActive:   sessionActive,
		SessionStarted:  started,
		DurationSeconds: dur,
		SamplesCount:    samplesCount,
		LastImageURL:    latestURL,
		LastAnalysis:    lastAnalysis,
		FocusHistory:    append([]FocusPoint(nil), focusHistory...),
	}
}

func startScheduler(e *echo.Echo) {
	if tickerStopChan != nil {
		return
	}
	tickerStopChan = make(chan struct{})
	ticker := time.NewTicker(time.Minute)
	go func() {
		// Run immediately, then every minute
		doCaptureCycle(e)
		for {
			select {
			case <-ticker.C:
				doCaptureCycle(e)
			case <-tickerStopChan:
				ticker.Stop()
				return
			}
		}
	}()
}

func stopScheduler() {
	if tickerStopChan != nil {
		close(tickerStopChan)
		tickerStopChan = nil
	}
}

func doCaptureCycle(e *echo.Echo) {
	img, aud, err := runCaptureOnce()
	if err != nil {
		e.Logger.Error(err)
		return
	}
	db, err := readAudio(aud)
	if err != nil {
		e.Logger.Error(err)
		return
	}
	analysis, err := analyzeImage(img)
	if err != nil {
		e.Logger.Error(err)
		return
	}
	mu.Lock()
	lastImageFile = img
	lastAnalysis = analysis
	samplesCount++
	focusHistory = append(focusHistory, FocusPoint{Timestamp: time.Now().Format(time.RFC3339),
		FocusLevel: analysis.FocusLevel, IsFocused: analysis.IsFocused, IsAway: analysis.IsAway, Decibels: db})
	mu.Unlock()
	if err := saveState(); err != nil {
		e.Logger.Warnf("saveState failed: %v", err)
	}
}

func main() {
	e := echo.New()

	// Load .env from repo root if present
	if root := findRepoRoot(); root != "" {
		repoRoot = root
		if err := loadDotEnv(filepath.Join(root, ".env")); err != nil {
			e.Logger.Warnf(".env not loaded: %v", err)
		} else {
			e.Logger.Printf("Loaded .env from %s", root)
		}
	}

	if err := ensureDirs(); err != nil {
		e.Logger.Fatal(err)
	}

	// Load previous state and sessions if available
	if err := loadState(); err != nil {
		e.Logger.Warnf("loadState failed: %v", err)
	}
	if err := loadAllSessions(); err != nil {
		e.Logger.Warnf("loadAllSessions failed: %v", err)
	}
	// If session was active, resume scheduler
	if sessionActive {
		startScheduler(e)
	}

	RegisterRoutes(e)

	e.Logger.Printf("Serving on :8085. Open http://localhost:8085/")
	e.Logger.Fatal(e.Start(":8085"))
}

// ---- .env loader (repo-root) ----

func findRepoRoot() string {
	cwd, _ := os.Getwd()
	dir := cwd
	for i := 0; i < 6; i++ {
		// Heuristics: .git or wileye/wileye.py existing from this dir
		if fileExists(filepath.Join(dir, ".env")) ||
			fileExists(filepath.Join(dir, ".git")) ||
			fileExists(filepath.Join(dir, wiliEyeScriptRel)) ||
			fileExists(filepath.Join(dir, wiliAudioScriptRel)) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func loadDotEnv(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	lines := strings.Split(string(b), "\n")
	// Simple KEY=VALUE parser, ignores comments and blank lines
	re := regexp.MustCompile(`^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$`)
	for _, ln := range lines {
		ln = strings.TrimSpace(ln)
		if ln == "" || strings.HasPrefix(ln, "#") {
			continue
		}
		m := re.FindStringSubmatch(ln)
		if len(m) != 3 {
			continue
		}
		k, v := m[1], m[2]
		// Trim surrounding quotes if present
		v = strings.TrimSpace(v)
		if strings.HasPrefix(v, "\"") && strings.HasSuffix(v, "\"") && len(v) >= 2 {
			v = strings.Trim(v, "\"")
		} else if strings.HasPrefix(v, "'") && strings.HasSuffix(v, "'") && len(v) >= 2 {
			v = strings.Trim(v, "'")
		}
		// Do not override if already set
		if _, exists := os.LookupEnv(k); !exists {
			_ = os.Setenv(k, v)
		}
	}
	return nil
}
