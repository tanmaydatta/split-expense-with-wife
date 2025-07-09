package handlers

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/common"
	"gorm.io/gorm"
)

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	cookie, err := r.Cookie("sessionid")
	if err != nil {
		http.Error(w, "no session", http.StatusUnauthorized)
		return
	}

	logout(cookie.Value)

	expiration := time.Now().Add(-24 * time.Hour)
	sessionCookie := http.Cookie{
		Name:     "sessionid",
		Value:    "",
		Expires:  expiration,
		HttpOnly: true,
		Path:     "/",
	}
	http.SetCookie(w, &sessionCookie)

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("{}"))
}

func logout(sessionid string) {
	if sessionid == "" {
		return
	}
	session := common.Session{}
	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Println("DSN_D1 environment variable not set")
		return
	}
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		return
	}
	tx := db.Select("username, sessionid, expiry_time").Where("sessionid = ?", sessionid).First(&session)
	if tx.Error != nil {
		return
	}
	db.Delete(&common.Session{}, "sessionid = ?", sessionid)
}
