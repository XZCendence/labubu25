package main

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"k8s.io/klog/v2"
)

// RegisterRoutes attaches all HTTP routes and middleware to Echo.
func RegisterRoutes(e *echo.Echo) {
	// Request logging via custom logger
	e.Use(middleware.RequestLoggerWithConfig(middleware.RequestLoggerConfig{
		LogLatency:    true,
		LogStatus:     true,
		LogMethod:     true,
		LogURIPath:    true,
		LogProtocol:   true,
		LogRemoteIP:   true,
		LogValuesFunc: customLogger,
	}))

	// Dashboard data
	e.GET("/api/dash/monolithic", func(c echo.Context) error {
		return c.JSON(http.StatusOK, snapshot())
	})

	// Session controls
	e.POST("/api/session/start", func(c echo.Context) error {
		mu.Lock()
		sessionActive = true
		sessionStart = time.Now()
		samplesCount = 0
		focusHistory = nil
		currentSessionID = time.Now().Format("20060102-150405")
		mu.Unlock()
		startScheduler(e)
		if err := saveState(); err != nil {
			klog.Errorf("saveState failed: %v", err)
		}
		return c.JSON(http.StatusOK, map[string]any{"ok": true})
	})

	e.POST("/api/session/stop", func(c echo.Context) error {
		mu.Lock()
		wasActive := sessionActive
		id := currentSessionID
		start := sessionStart
		sc := samplesCount
		fh := append([]FocusPoint(nil), focusHistory...)
		la := lastAnalysis
		sessionActive = false
		currentSessionID = ""
		mu.Unlock()
		stopScheduler()
		if wasActive {
			s := Session{
				ID:           id,
				Start:        start,
				End:          time.Now(),
				SamplesCount: sc,
				FocusHistory: fh,
				LastAnalysis: la,
			}
			if err := saveCompletedSession(s); err != nil {
				klog.Errorf("saveCompletedSession failed: %v", err)
			} else {
				mu.Lock()
				sessions = append(sessions, s)
				mu.Unlock()
			}
		}
		if err := saveState(); err != nil {
			klog.Errorf("saveState failed: %v", err)
		}
		return c.JSON(http.StatusOK, map[string]any{"ok": true})
	})

	// Health
	e.GET("/api/health", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})

	// Immediate capture + analysis
	e.POST("/api/capture/once", func(c echo.Context) error {
		img, err := runCaptureOnce()
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
		}
		a, err := analyzeImage(img)
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]any{"error": err.Error()})
		}
		mu.Lock()
		lastImageFile = img
		lastAnalysis = a
		samplesCount++
		focusHistory = append(focusHistory, FocusPoint{Timestamp: time.Now().Format(time.RFC3339), Level: a.FocusLevel})
		mu.Unlock()
		if err := saveState(); err != nil {
			klog.Errorf("saveState failed: %v", err)
		}
		return c.JSON(http.StatusOK, a)
	})
}
