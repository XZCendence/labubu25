package main

import (
	"fmt"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"k8s.io/klog/v2"
)

func customLogger(c echo.Context, v middleware.RequestLoggerValues) error {
	latency := v.Latency
	status := v.Status
	method := v.Method
	url := v.URIPath
	ip := c.RealIP()
	proto := v.Protocol
	methodColors := map[string]string{
		"GET":     "\033[42m",       // Green background
		"POST":    "\033[43m",       // Yellow background
		"PUT":     "\033[44m",       // Blue background
		"DELETE":  "\033[45m",       // Purple background
		"PATCH":   "\033[46m",       // Cyan background
		"HEAD":    "\033[47m",       // Gray background
		"OPTIONS": "\033[48;5;210m", // Custom background color (orange-ish)
	}
	colorizedMethod := methodColors[method] + " " + method + " \033[0m"

	statusCodeColors := map[int]int{
		200: 32,
		204: 32,
		300: 36,
		401: 33,
		403: 33,
		404: 31,
		500: 31,
		502: 31,
		503: 31,
		504: 31,
	}
	colorizedStatusCode := fmt.Sprintf("\033[%dm%d\033[0m", statusCodeColors[status], status)
	logMessage := fmt.Sprintf("%s |%s| %s %s %s %s",

		ip,
		colorizedMethod,
		url,
		proto,
		colorizedStatusCode,
		latency.String(),
	)
	klog.Info(logMessage)
	return nil
}
