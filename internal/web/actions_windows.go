//go:build windows

package web

import "fmt"

func killProcess(pid int) error    { return fmt.Errorf("process action not supported on Windows") }
func termProcess(pid int) error    { return fmt.Errorf("process action not supported on Windows") }
func pauseProcess(pid int) error   { return fmt.Errorf("process action not supported on Windows") }
func resumeProcess(pid int) error  { return fmt.Errorf("process action not supported on Windows") }
func setNice(pid, value int) error { return fmt.Errorf("renice not supported on Windows") }
