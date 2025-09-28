package main

import (
    "net/http"
    "path/filepath"
    "time"

    "github.com/labstack/echo/v4"
    "github.com/labstack/echo/v4/middleware"
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

    // Static files and images
    // Static dir relative to repo root
    staticDir := filepath.Join(repoRoot, staticDirRel)
    if repoRoot == "" { // fallback when running from repo root
        staticDir = staticDirRel
    }
    staticDir = filepath.Clean(staticDir)
    e.Static("/", staticDir)
    e.Static("/images", dataDir())

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
        mu.Unlock()
        startScheduler(e)
        return c.JSON(http.StatusOK, map[string]any{"ok": true})
    })

    e.POST("/api/session/stop", func(c echo.Context) error {
        mu.Lock()
        sessionActive = false
        mu.Unlock()
        stopScheduler()
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
        return c.JSON(http.StatusOK, a)
    })
}
